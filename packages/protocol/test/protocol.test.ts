import { describe, expect, it } from 'vitest';
import {
  agentHelloSchema,
  agentPingSchema,
  agentSampleSchema,
  bucketSchema,
  hubToAgentMessageSchema,
  hubToViewerMessageSchema,
  parseAgentMessage,
  ringPointSchema,
  safeString,
  siteConfigSchema,
  viewerToHubMessageSchema,
} from '../src/index.js';

describe('Safe String Schema', () => {
  it('accepts normal printable unicode strings', () => {
    const schema = safeString(128);
    expect(schema.parse('tokyo-server-1')).toBe('tokyo-server-1');
    expect(schema.parse('东京-服务器-1 🚀')).toBe('东京-服务器-1 🚀');
  });

  it('rejects control characters', () => {
    const schema = safeString(128);
    expect(() => schema.parse('hello\x00world')).toThrow();
    expect(() => schema.parse('hello\x07world')).toThrow();
    expect(() => schema.parse('hello\x1Fworld')).toThrow();
    expect(() => schema.parse('hello\x7Fworld')).toThrow();
  });

  it('rejects unicode bidi override characters', () => {
    const schema = safeString(128);
    expect(() => schema.parse('server\u202Aname')).toThrow();
    expect(() => schema.parse('server\u202Ename')).toThrow();
    expect(() => schema.parse('server\u2066name')).toThrow();
  });

  it('rejects strings exceeding maximum length', () => {
    const schema = safeString(5);
    expect(() => schema.parse('123456')).toThrow();
    expect(schema.parse('12345')).toBe('12345');
  });
});

describe('Agent Hello Message Schema', () => {
  const validHello = {
    t: 'hello' as const,
    v: 1 as const,
    agent: '1.0.0',
    host: {
      hostname: 'tokyo-1',
      os: 'linux',
      platform: 'debian',
      platform_ver: '12',
      kernel: '6.1.0-21-amd64',
      arch: 'amd64',
      virt: 'kvm',
      cpu_model: 'AMD EPYC 7B13',
      cpu_cores: 2,
      mem_total: 2048000000,
      swap_total: 0,
      disk_total: 40000000000,
      boot_ts: 1758000000,
    },
    ip: { v4: '203.0.113.5', v6: null },
  };

  it('parses valid hello message', () => {
    expect(agentHelloSchema.parse(validHello)).toEqual(validHello);
    expect(parseAgentMessage(JSON.stringify(validHello))).toEqual(validHello);
  });

  it('rejects unknown fields (.strict)', () => {
    expect(() =>
      agentHelloSchema.parse({ ...validHello, extra_field: 'malicious' })
    ).toThrow();
    expect(() =>
      agentHelloSchema.parse({
        ...validHello,
        host: { ...validHello.host, evil: 123 },
      })
    ).toThrow();
  });

  it('validates cpu_cores boundary', () => {
    expect(() =>
      agentHelloSchema.parse({
        ...validHello,
        host: { ...validHello.host, cpu_cores: 0 },
      })
    ).toThrow();
    expect(() =>
      agentHelloSchema.parse({
        ...validHello,
        host: { ...validHello.host, cpu_cores: 4097 },
      })
    ).toThrow();
    expect(
      agentHelloSchema.parse({
        ...validHello,
        host: { ...validHello.host, cpu_cores: 1 },
      }).host.cpu_cores
    ).toBe(1);
    expect(
      agentHelloSchema.parse({
        ...validHello,
        host: { ...validHello.host, cpu_cores: 4096 },
      }).host.cpu_cores
    ).toBe(4096);
  });
});

describe('Agent Sample and Bucket Schema', () => {
  const validBucket = {
    ts: 1758000000,
    cpu: [11.8, 19.2],
    mem: [39.6, 40.1],
    swp: [0],
    dsk: [30.0],
    ld1: [0.4, 0.55],
    nin: [1200000, 1900000],
    nout: [800000, 1400000],
    rxb: 72000000,
    txb: 48000000,
    tcp: [41],
    udp: [6],
    pr: [118],
    n: 30,
  };

  const validSample = {
    t: 's' as const,
    ts: 1758000010,
    cpu: 12.5,
    ld: [0.42, 0.35, 0.3] as [number, number, number],
    mem: { u: 812000000, t: 2048000000 },
    swp: { u: 0, t: 0 },
    dsk: [{ m: '/', u: 12000000000, t: 40000000000 }],
    net: {
      rx: 123456789012,
      tx: 98765432101,
      rxs: 1250000,
      txs: 830000,
    },
    cn: { tcp: 42, udp: 6 },
    pr: 118,
    up: 864000,
    tmp: 41.0,
    b: validBucket,
  };

  it('parses valid sample message with bucket', () => {
    expect(agentSampleSchema.parse(validSample)).toEqual(validSample);
  });

  it('parses sample without bucket', () => {
    const { b: _b, ...sampleNoBucket } = validSample;
    expect(agentSampleSchema.parse(sampleNoBucket)).toEqual(sampleNoBucket);
  });

  it('rejects cpu > 100 or < 0', () => {
    expect(() =>
      agentSampleSchema.parse({ ...validSample, cpu: 100.1 })
    ).toThrow();
    expect(() =>
      agentSampleSchema.parse({ ...validSample, cpu: -0.1 })
    ).toThrow();
  });

  it('rejects disk array > 16 items', () => {
    const tooManyDisks = Array.from({ length: 17 }, (_, i) => ({
      m: `/disk-${i}`,
      u: 1000,
      t: 2000,
    }));
    expect(() =>
      agentSampleSchema.parse({ ...validSample, dsk: tooManyDisks })
    ).toThrow();
  });

  it('validates bucket n bounds (1..120)', () => {
    expect(() => bucketSchema.parse({ ...validBucket, n: 0 })).toThrow();
    expect(() => bucketSchema.parse({ ...validBucket, n: 121 })).toThrow();
    expect(bucketSchema.parse({ ...validBucket, n: 1 }).n).toBe(1);
    expect(bucketSchema.parse({ ...validBucket, n: 120 }).n).toBe(120);
  });

  it('rejects unknown fields in bucket and sample', () => {
    expect(() =>
      bucketSchema.parse({ ...validBucket, unknownKey: 123 })
    ).toThrow();
    expect(() =>
      agentSampleSchema.parse({ ...validSample, unknownKey: 123 })
    ).toThrow();
  });
});

describe('Ping message schema', () => {
  it('parses ping message', () => {
    expect(agentPingSchema.parse({ t: 'ping' })).toEqual({ t: 'ping' });
    expect(parseAgentMessage({ t: 'ping' })).toEqual({ t: 'ping' });
  });

  it('rejects unknown keys in ping', () => {
    expect(() => agentPingSchema.parse({ t: 'ping', extra: 'bad' })).toThrow();
  });
});

describe('Hub To Agent messages', () => {
  it('parses welcome message', () => {
    const welcome = {
      t: 'welcome' as const,
      server_id: 'srv_12345678',
      name: 'Server 1',
      interval: 10,
      bucket_minutes: 1,
      now_ms: 1758000000000,
      max_bytes: 16384,
    };
    expect(hubToAgentMessageSchema.parse(welcome)).toEqual(welcome);
  });

  it('parses config, bye, and pong messages', () => {
    expect(
      hubToAgentMessageSchema.parse({
        t: 'config',
        interval: 20,
        bucket_minutes: 2,
      })
    ).toEqual({ t: 'config', interval: 20, bucket_minutes: 2 });
    expect(
      hubToAgentMessageSchema.parse({ t: 'bye', reason: 'maintenance' })
    ).toEqual({ t: 'bye', reason: 'maintenance' });
    expect(hubToAgentMessageSchema.parse({ t: 'pong' })).toEqual({
      t: 'pong',
    });
  });

  it('rejects invalid message types', () => {
    expect(() =>
      hubToAgentMessageSchema.parse({ t: 'exec', cmd: 'rm -rf' })
    ).toThrow();
  });
});

describe('Viewer messages', () => {
  it('validates RingPoint tuple length (must be 18 numbers)', () => {
    const validRingPoint: [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ] = [
      1758000000, 10, 20, 30, 40, 0, 50, 0.5, 0.8, 1000, 2000, 500, 1000, 50000,
      25000, 10, 2, 80,
    ];
    expect(ringPointSchema.parse(validRingPoint)).toEqual(validRingPoint);

    // 17 elements -> reject
    expect(() => ringPointSchema.parse(validRingPoint.slice(0, 17))).toThrow();
    // 19 elements -> reject
    expect(() => ringPointSchema.parse([...validRingPoint, 999])).toThrow();
  });

  it('parses snapshot, delta, and alert messages', () => {
    const delta = {
      t: 'delta' as const,
      id: 'srv_1',
      ts: 1758000010,
      s: {
        t: 's' as const,
        ts: 1758000010,
        cpu: 15.0,
        ld: [0.1, 0.2, 0.3] as [number, number, number],
        mem: { u: 100, t: 200 },
        swp: { u: 0, t: 0 },
        dsk: [{ m: '/', u: 10, t: 100 }],
        net: { rx: 100, tx: 100, rxs: 10, txs: 10 },
        cn: { tcp: 5, udp: 1 },
        pr: 50,
        up: 1000,
      },
    };
    expect(hubToViewerMessageSchema.parse(delta)).toEqual(delta);

    const alert = {
      t: 'alert' as const,
      event: {
        id: 'evt_1',
        rule_id: 'r_1',
        rule_name: 'High CPU',
        server_id: 'srv_1',
        severity: 'warning' as const,
        state: 'firing' as const,
        value: 92.5,
        ts: 1758000010,
      },
    };
    expect(hubToViewerMessageSchema.parse(alert)).toEqual(alert);
  });

  it('parses viewer ping and rejects invalid client commands', () => {
    expect(viewerToHubMessageSchema.parse({ t: 'ping' })).toEqual({
      t: 'ping',
    });
    expect(() =>
      viewerToHubMessageSchema.parse({ t: 'subscribe', channel: 'admin' })
    ).toThrow();
  });
});

describe('API DTO Schemas', () => {
  it('parses site config', () => {
    const site = {
      name: 'NodePulse Monitor',
      public_mode: false,
      locale: 'zh-CN',
      timezone: 'UTC',
      wall: {
        scene: 'map',
        carousel_interval: 60,
        show_fields: ['cpu', 'mem'],
      },
    };
    expect(siteConfigSchema.parse(site)).toEqual(site);
  });

  it('rejects unknown fields in site config', () => {
    expect(() =>
      siteConfigSchema.parse({
        name: 'Test',
        public_mode: false,
        locale: 'en',
        timezone: 'UTC',
        extra_key: 'denied',
      })
    ).toThrow();
  });
});
