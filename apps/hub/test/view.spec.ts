import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import app from '../src/index.js';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE_NAME } from '../src/auth/cookies.js';
import { randomTokenHex, sha256Hex } from '../src/auth/crypto.js';

const migrations = [
  {
    name: '0001_init.sql',
    queries: [
      `CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, group_id TEXT,
        token_hash BLOB NOT NULL, token_prefix TEXT NOT NULL, note TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0, public INTEGER NOT NULL DEFAULT 0,
        geo_lat REAL, geo_lng REAL, geo_label TEXT, country TEXT,
        traffic_quota_bytes INTEGER, traffic_reset_day INTEGER, traffic_direction TEXT,
        interval_s INTEGER NOT NULL DEFAULT 10,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT, role TEXT NOT NULL CHECK(role IN ('admin')), created_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS passkeys (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL,
        credential_id BLOB UNIQUE NOT NULL, public_key BLOB NOT NULL, counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT, aaguid TEXT, backed_up INTEGER, name TEXT, created_at INTEGER NOT NULL, last_used_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL, ip_hash TEXT, ua TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS view_tokens (
        id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, name TEXT NOT NULL, scope TEXT NOT NULL,
        created_at INTEGER NOT NULL, expires_at INTEGER, revoked_at INTEGER, last_used_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS webauthn_challenges (id TEXT PRIMARY KEY, challenge BLOB NOT NULL, kind TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, user_id TEXT, action TEXT NOT NULL, target TEXT, details TEXT, ip_hash TEXT)`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    ],
  },
];

describe('Viewer WebSocket & Read APIs (/ws/view & /api/bootstrap)', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
  };

  const adminUserId = 'usr_viewer_admin';
  let adminSessionId: string;
  const serverId = 'srv_view_1';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, migrations);
    const now = Math.floor(Date.now() / 1000);

    // Create user and session
    await db.createUser(testEnv.DB, {
      id: adminUserId,
      username: 'admin',
      display_name: 'SysAdmin',
      role: 'admin',
      created_at: now,
    });

    adminSessionId = randomTokenHex(32);
    const sessionHash = await sha256Hex(adminSessionId);
    await db.createSession(testEnv.DB, {
      id_hash: sessionHash,
      user_id: adminUserId,
      created_at: now,
      expires_at: now + 3600,
      last_seen_at: now,
      ip_hash: null,
      ua: 'TestRunner',
    });

    // Create a server
    await db.createServer(testEnv.DB, {
      id: serverId,
      name: 'Server For View',
      group_id: null,
      token_hash: new Uint8Array([1, 1, 1]),
      token_prefix: 'np1.sr',
      note: 'Demo',
      sort_order: 1,
      public: 1,
      geo_lat: null,
      geo_lng: null,
      geo_label: null,
      country: null,
      traffic_quota_bytes: null,
      traffic_reset_day: null,
      traffic_direction: null,
      interval_s: 10,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
  });

  it('ws_view_rejects_origin_mismatch', async () => {
    const res = await app.request(
      '/ws/view',
      {
        headers: {
          Upgrade: 'websocket',
          Origin: 'https://attacker.com',
        },
      },
      testEnv
    );
    expect(res.status).toBe(403);
  });

  it('ws_view_rejects_unauthenticated_when_not_public', async () => {
    // public_mode is not enabled
    const res = await app.request(
      '/ws/view',
      {
        headers: {
          Upgrade: 'websocket',
          Origin: testEnv.APP_ORIGIN,
        },
      },
      testEnv
    );
    expect(res.status).toBe(401);
  });

  it('ws_view_upgrades_and_sends_snapshot_for_authenticated_viewer', async () => {
    const res = await app.request(
      '/ws/view',
      {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
          Origin: testEnv.APP_ORIGIN,
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      },
      testEnv
    );

    expect(res.status).toBe(101);
    const ws = res.webSocket!;
    ws.accept();

    let snapshotReceived = false;
    ws.addEventListener('message', (evt: MessageEvent) => {
      const data = JSON.parse(evt.data as string) as { t: string };
      if (data.t === 'snapshot') {
        snapshotReceived = true;
      }
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(snapshotReceived).toBe(true);
  });

  it('api_bootstrap_returns_complete_site_servers_and_series', async () => {
    const res = await app.request(
      '/api/bootstrap',
      {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      },
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: {
        site: { name: string };
        servers: { id: string; name: string }[];
        series_1h: Record<string, unknown>;
      };
    };
    expect(json.ok).toBe(true);
    expect(json.data.site.name).toBeDefined();
    expect(json.data.servers.some((s) => s.id === serverId)).toBe(true);
    expect(json.data.series_1h).toBeDefined();
  });

  it('api_servers_series_returns_series_response', async () => {
    const res = await app.request(
      `/api/servers/${serverId}/series?range=24h`,
      {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      },
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { points: unknown[] };
    expect(Array.isArray(json.points)).toBe(true);
  });
});
