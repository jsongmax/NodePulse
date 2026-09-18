import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import type { Hub } from '../src/hub.js';

describe('Hub syncConfig RPC Linkage', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
  };

  async function connectAgent(
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

  it('syncConfig_kicks_agent_on_server_delete_with_4403', async () => {
    const serverId = 'srv_del_test';
    const { clientWs, hubStub } = await connectAgent(serverId);

    let closeCode: number | null = null;
    clientWs.addEventListener('close', (evt: CloseEvent) => {
      closeCode = evt.code;
    });

    await hubStub.syncConfig({ action: 'server_deleted', serverId });
    await new Promise((r) => setTimeout(r, 100));

    expect(closeCode).toBe(4403);
  });

  it('syncConfig_kicks_agent_on_token_rotation_with_4401', async () => {
    const serverId = 'srv_rot_test';
    const { clientWs, hubStub } = await connectAgent(serverId);

    let closeCode: number | null = null;
    clientWs.addEventListener('close', (evt: CloseEvent) => {
      closeCode = evt.code;
    });

    await hubStub.syncConfig({ action: 'token_rotated', serverId });
    await new Promise((r) => setTimeout(r, 100));

    expect(closeCode).toBe(4401);
  });

  it('syncConfig_sends_hot_config_update_to_agent_when_interval_changes', async () => {
    const serverId = 'srv_hot_config';
    const { clientWs, hubStub } = await connectAgent(serverId, 10);

    let receivedConfig: { t: string; interval: number } | null = null;
    clientWs.addEventListener('message', (evt: MessageEvent) => {
      const data = JSON.parse(evt.data as string) as {
        t: string;
        interval: number;
      };
      if (data.t === 'config') {
        receivedConfig = data;
      }
    });

    await hubStub.syncConfig({
      action: 'server_updated',
      serverId,
      changes: { interval_s: 30 },
    });

    await new Promise((r) => setTimeout(r, 100));
    const cfg = receivedConfig as { t: string; interval: number } | null;
    expect(cfg).not.toBeNull();
    expect(cfg?.t).toBe('config');
    expect(cfg?.interval).toBe(30);
  });
});
