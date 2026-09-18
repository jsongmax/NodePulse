import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { Hub } from '../src/hub.js';

describe('Hub Durable Object Core & Storage', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
  };

  async function createConnectedAgent(
    serverId: string,
    interval = 10
  ): Promise<{ clientWs: WebSocket; hubStub: DurableObjectStub<Hub> }> {
    const hubNamespace = testEnv.HUB as unknown as DurableObjectNamespace<Hub>;
    const hubStub = hubNamespace.get(hubNamespace.idFromName('main'));
    const req = new Request('http://localhost/ws/agent', {
      headers: {
        Upgrade: 'websocket',
        'X-NP-Kind': 'agent',
        'X-NP-Server-Id': serverId,
        'X-NP-Interval': String(interval),
      },
    });
    const res = await hubStub.fetch(req);
    expect(res.status).toBe(101);
    const clientWs = res.webSocket!;
    clientWs.accept();
    return { clientWs, hubStub };
  }

  it('oversized_message_closes_socket_with_1009', async () => {
    const { clientWs } = await createConnectedAgent('srv_oversized');

    let closeCode: number | null = null;
    clientWs.addEventListener('close', (evt: CloseEvent) => {
      closeCode = evt.code;
    });

    // Send 17 KB payload (> 16384 bytes)
    const largePayload = 'a'.repeat(17000);
    clientWs.send(largePayload);

    // Wait a tick for DO to process
    await new Promise((r) => setTimeout(r, 100));
    expect(closeCode).toBe(1009);
  });

  it('unknown_message_type_closes_socket_with_4000', async () => {
    const { clientWs } = await createConnectedAgent('srv_unknown_t');

    let closeCode: number | null = null;
    clientWs.addEventListener('close', (evt: CloseEvent) => {
      closeCode = evt.code;
    });

    clientWs.send(JSON.stringify({ t: 'unknown_action', cmd: 'run' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(closeCode).toBe(4000);
  });

  it('duplicate_hello_closes_socket_with_1008', async () => {
    const { clientWs } = await createConnectedAgent('srv_dup_hello');

    let closeCode: number | null = null;
    let welcomeReceived = false;

    clientWs.addEventListener('close', (evt: CloseEvent) => {
      closeCode = evt.code;
    });

    clientWs.addEventListener('message', (evt: MessageEvent) => {
      const data = JSON.parse(evt.data as string) as { t: string };
      if (data.t === 'welcome') welcomeReceived = true;
    });

    const helloMsg = {
      t: 'hello',
      v: 1,
      agent: '1.0.0',
      host: {
        hostname: 'test-node',
        os: 'linux',
        platform: 'ubuntu',
        platform_ver: '24.04',
        kernel: '6.8.0',
        arch: 'amd64',
        virt: 'kvm',
        cpu_model: 'EPYC',
        cpu_cores: 4,
        mem_total: 4000000000,
        swap_total: 0,
        disk_total: 50000000000,
        boot_ts: 1700000000,
      },
    };

    // First hello -> gets welcome
    clientWs.send(JSON.stringify(helloMsg));
    await new Promise((r) => setTimeout(r, 100));
    expect(welcomeReceived).toBe(true);
    expect(closeCode).toBeNull();

    // Second hello -> closes with 1008
    clientWs.send(JSON.stringify(helloMsg));
    await new Promise((r) => setTimeout(r, 100));
    expect(closeCode).toBe(1008);
  });

  it('overclocked_reporting_closes_socket_with_4008', async () => {
    // interval = 10s -> min interval is 5000ms
    const { clientWs } = await createConnectedAgent('srv_overclock', 10);

    let closeCode: number | null = null;
    clientWs.addEventListener('close', (evt: CloseEvent) => {
      closeCode = evt.code;
    });

    const sample = {
      t: 's',
      ts: Math.floor(Date.now() / 1000),
      cpu: 10,
      ld: [0.1, 0.2, 0.3],
      mem: { u: 100, t: 200 },
      swp: { u: 0, t: 0 },
      dsk: [{ m: '/', u: 10, t: 100 }],
      net: { rx: 10, tx: 10, rxs: 1, txs: 1 },
      cn: { tcp: 1, udp: 1 },
      pr: 10,
      up: 100,
    };

    // Send 4 samples back-to-back without waiting (fastCount >= 3)
    clientWs.send(JSON.stringify(sample));
    clientWs.send(JSON.stringify(sample));
    clientWs.send(JSON.stringify(sample));
    clientWs.send(JSON.stringify(sample));

    await new Promise((r) => setTimeout(r, 150));
    expect(closeCode).toBe(4008);
  });

  it('ring_upsert_same_slot_overwrites_and_getSeries_filters_by_ts', async () => {
    const serverId = 'srv_ring_test';
    const { clientWs, hubStub } = await createConnectedAgent(serverId, 10);

    const now = Math.floor(Date.now() / 1000);
    // Align to minute boundary
    const minuteTs = Math.floor(now / 60) * 60;

    const sampleWithBucket1 = {
      t: 's',
      ts: minuteTs + 10,
      cpu: 10,
      ld: [0.1, 0.2, 0.3],
      mem: { u: 100, t: 200 },
      swp: { u: 0, t: 0 },
      dsk: [{ m: '/', u: 10, t: 100 }],
      net: { rx: 10, tx: 10, rxs: 1, txs: 1 },
      cn: { tcp: 1, udp: 1 },
      pr: 10,
      up: 100,
      b: {
        ts: minuteTs,
        cpu: [10.0, 15.0],
        mem: [20.0, 25.0],
        swp: [0],
        dsk: [30.0],
        ld1: [0.5, 0.8],
        nin: [1000, 2000],
        nout: [500, 1000],
        rxb: 10000,
        txb: 5000,
        tcp: [10],
        udp: [2],
        pr: [50],
        n: 30,
      },
    };

    // 1. Send first bucket for this minute
    clientWs.send(JSON.stringify(sampleWithBucket1));
    await new Promise((r) => setTimeout(r, 100));

    // 2. Send second bucket with different CPU value for the EXACT SAME minute slot
    const sampleWithBucket2 = {
      ...sampleWithBucket1,
      b: {
        ...sampleWithBucket1.b,
        cpu: [88.8, 99.9], // Overwrite with new value
      },
    };
    clientWs.send(JSON.stringify(sampleWithBucket2));
    await new Promise((r) => setTimeout(r, 100));

    // 3. Call getSeries RPC
    const seriesRes = await hubStub.getSeries(serverId, '1h');
    expect(seriesRes.status).toBe(200);
    const seriesJson = (await seriesRes.json()) as {
      points: [number, number, number, ...number[]][];
    };

    expect(seriesJson.points.length).toBe(1);
    const point = seriesJson.points[0]!;
    expect(point[0]).toBe(minuteTs);
    // Point has overwritten cpu_a = 88.8, cpu_m = 99.9
    expect(point[1]).toBe(88.8);
    expect(point[2]).toBe(99.9);

    // 4. Test filtering: an older point (> 1 hour ago) is filtered out
    const oldMinuteTs = now - 7200; // 2 hours ago
    const oldSample = {
      ...sampleWithBucket1,
      b: {
        ...sampleWithBucket1.b,
        ts: oldMinuteTs,
      },
    };
    clientWs.send(JSON.stringify(oldSample));
    await new Promise((r) => setTimeout(r, 100));

    // Query 1h -> only 1 point (the recent one), old one filtered out
    const recentRes = await hubStub.getSeries(serverId, '1h');
    const recentJson = (await recentRes.json()) as {
      points: unknown[];
    };
    expect(recentJson.points.length).toBe(1);

    // Query 24h -> both points returned
    const dayRes = await hubStub.getSeries(serverId, '24h');
    const dayJson = (await dayRes.json()) as {
      points: unknown[];
    };
    expect(dayJson.points.length).toBe(2);
  });
});
