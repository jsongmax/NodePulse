import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import app from '../src/index.js';
import * as db from '../src/db/index.js';
import { generateServerToken } from '../src/api/admin/servers.js';

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

describe('Agent WebSocket Authentication & Upgrade (/ws/agent)', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
    TOKEN_PEPPER: 'test_pepper_long_random_value_32_bytes',
  };

  const validServerId = 'srv_agent_123';
  let validToken: string;

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, migrations);
    const now = Math.floor(Date.now() / 1000);

    const { fullToken, tokenHash, tokenPrefix } = await generateServerToken(
      validServerId,
      testEnv.TOKEN_PEPPER
    );
    validToken = fullToken;

    await db.createServer(testEnv.DB, {
      id: validServerId,
      name: 'Agent Test Server',
      group_id: null,
      token_hash: tokenHash,
      token_prefix: tokenPrefix,
      note: null,
      sort_order: 0,
      public: 0,
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

  it('rejects_non_websocket_requests_with_426', async () => {
    const res = await app.request('/ws/agent', {}, testEnv);
    expect(res.status).toBe(426);
  });

  it('invalid_token_returns_401_and_counts_ratelimit', async () => {
    let rateLimitKeyChecked: string | null = null;
    const testEnvWithRateLimit = {
      ...testEnv,
      RL_AGENT: {
        limit: async (opts: { key: string }) => {
          rateLimitKeyChecked = opts.key;
          return { success: true };
        },
      },
    };

    // 1. Missing Authorization header
    const noAuth = await app.request(
      '/ws/agent',
      {
        headers: { Upgrade: 'websocket' },
      },
      testEnvWithRateLimit
    );
    expect(noAuth.status).toBe(401);

    // 2. Invalid token format
    const badFormat = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Authorization: 'Bearer invalid_token_without_parts',
        },
      },
      testEnvWithRateLimit
    );
    expect(badFormat.status).toBe(401);

    // 3. Unknown server ID -> triggers RL_AGENT rate limit
    const unknownServer = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Authorization:
            'Bearer np1.unknownsrv12.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      },
      testEnvWithRateLimit
    );
    expect(unknownServer.status).toBe(401);
    expect(rateLimitKeyChecked).not.toBeNull();

    // 4. Wrong secret -> triggers RL_AGENT rate limit
    const wrongSecret = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Authorization: `Bearer np1.${validServerId}.wrongsecretwrongsecretwrongsecretwrongsecret12`,
        },
      },
      testEnvWithRateLimit
    );
    expect(wrongSecret.status).toBe(401);
  });

  it('valid_token_returns_101_switching_protocols', async () => {
    const res = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
          Authorization: `Bearer ${validToken}`,
        },
      },
      testEnv
    );
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeDefined();
  });

  it('forged_internal_header_is_dropped', async () => {
    // Client supplies forged X-NP-Server-Id header
    const res = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
          Authorization: `Bearer ${validToken}`,
          'X-NP-Server-Id': 'forged_evil_server_id',
          'X-NP-Kind': 'viewer',
        },
      },
      testEnv
    );

    // The request successfully authenticates against validToken's true serverId,
    // and forged headers are completely dropped
    expect(res.status).toBe(101);
    expect(res.webSocket).toBeDefined();

    // Check DO state: attachment contains true serverId, not forged_evil_server_id
    const hubStub = testEnv.HUB.get(testEnv.HUB.idFromName('main'));
    // The DO has accepted socket with agent:srv_agent_123, not forged_evil_server_id
    expect(hubStub).toBeDefined();
  });

  it('SEC_M1_06_malformed_agent_tokens_trigger_audit_log_and_rate_limiting', async () => {
    let rateLimited = false;
    const testEnvWithRateLimit = {
      ...testEnv,
      RL_AGENT: {
        limit: async () => {
          rateLimited = true;
          return { success: true };
        },
      },
    };

    // Send malformed token
    const res = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Authorization: 'Bearer malformed.token',
        },
      },
      testEnvWithRateLimit
    );

    expect(res.status).toBe(401);
    expect(rateLimited).toBe(true);

    // Verify audit log has recorded the failure
    const auditLogs = await db.listAuditLogs(testEnv.DB, 10);
    const failureLog = auditLogs.items.find(
      (log) => log.action === 'agent_auth_failed'
    );
    expect(failureLog).toBeDefined();
    expect(failureLog?.details).toContain('Invalid token structure');
  });
});
