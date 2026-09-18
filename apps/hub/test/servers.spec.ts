import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import app from '../src/index.js';
import * as db from '../src/db/index.js';
import { SESSION_COOKIE_NAME, VIEW_COOKIE_NAME } from '../src/auth/cookies.js';
import { hmacSha256, randomTokenHex, sha256Hex } from '../src/auth/crypto.js';

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

describe('Admin Server CRUD & Token Management', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
    TOKEN_PEPPER: 'test_pepper_long_random_value_32_bytes',
  };

  const adminUserId = 'usr_admin_servers';
  let adminSessionId: string;
  let viewTokenRaw: string;

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, migrations);
    const now = Math.floor(Date.now() / 1000);

    // Create admin user
    await db.createUser(testEnv.DB, {
      id: adminUserId,
      username: 'admin',
      display_name: 'Admin',
      role: 'admin',
      created_at: now,
    });

    // Create admin session
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

    // Create view token
    viewTokenRaw = randomTokenHex(32);
    const viewTokenHash = await sha256Hex(viewTokenRaw);
    await db.createViewToken(testEnv.DB, {
      id: 'vt_reader',
      token_hash: viewTokenHash,
      name: 'Reader',
      scope: JSON.stringify({ fields: 'public' }),
      created_at: now,
      expires_at: now + 3600,
      revoked_at: null,
      last_used_at: null,
    });
  });

  it('admin_servers_crud_rejects_unauthenticated_and_view_tokens', async () => {
    // 1. Unauthenticated -> 401
    const noAuth = await app.request('/api/admin/servers', {}, testEnv);
    expect(noAuth.status).toBe(401);

    // 2. View Token -> 403 forbidden
    const viewAuth = await app.request(
      '/api/admin/servers',
      {
        headers: {
          Cookie: `${VIEW_COOKIE_NAME}=${viewTokenRaw}`,
        },
      },
      testEnv
    );
    expect(viewAuth.status).toBe(403);
    const viewJson = (await viewAuth.json()) as {
      ok: boolean;
      error: { code: string };
    };
    expect(viewJson.error.code).toBe('forbidden');
  });

  it('server_creation_issues_token_with_prefix_and_hmac_hash', async () => {
    const res = await app.request(
      '/api/admin/servers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({
          name: 'Tokyo Node 1',
          geo_label: 'Tokyo',
          country: 'JP',
          interval_s: 10,
        }),
      },
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: {
        server: { id: string; name: string; token_prefix: string };
        token: string;
      };
    };
    expect(json.ok).toBe(true);
    const { server, token } = json.data;
    expect(server.name).toBe('Tokyo Node 1');
    expect(token).toMatch(/^np1\.[a-z0-9]{12}\.[a-zA-Z0-9_-]{43}$/);
    expect(server.token_prefix).toBe(token.slice(0, 6));

    // Verify token hash in D1
    const stored = await db.findServerById(testEnv.DB, server.id);
    expect(stored).not.toBeNull();
    const tokenSecret = token.split('.')[2]!;
    const expectedHash = await hmacSha256(testEnv.TOKEN_PEPPER, tokenSecret);
    expect(new Uint8Array(stored!.token_hash)).toEqual(expectedHash);
  });

  it('server_token_rotation_issues_new_token_and_updates_hash', async () => {
    // 1. Create a server
    const createRes = await app.request(
      '/api/admin/servers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({ name: 'Rotate Target' }),
      },
      testEnv
    );
    const createJson = (await createRes.json()) as {
      data: { server: { id: string }; token: string };
    };
    const serverId = createJson.data.server.id;
    const oldToken = createJson.data.token;

    // 2. Rotate token
    const rotateRes = await app.request(
      `/api/admin/servers/${serverId}/token/rotate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      },
      testEnv
    );

    expect(rotateRes.status).toBe(200);
    const rotateJson = (await rotateRes.json()) as {
      ok: boolean;
      data: { token: string; token_prefix: string };
    };
    expect(rotateJson.ok).toBe(true);
    const newToken = rotateJson.data.token;
    expect(newToken).not.toBe(oldToken);

    // Verify new hash in D1
    const stored = await db.findServerById(testEnv.DB, serverId);
    const newSecret = newToken.split('.')[2]!;
    const expectedNewHash = await hmacSha256(testEnv.TOKEN_PEPPER, newSecret);
    expect(new Uint8Array(stored!.token_hash)).toEqual(expectedNewHash);
  });

  it('server_patch_and_soft_delete', async () => {
    // Create server
    const createRes = await app.request(
      '/api/admin/servers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({ name: 'Patch Target' }),
      },
      testEnv
    );
    const createJson = (await createRes.json()) as {
      data: { server: { id: string } };
    };
    const serverId = createJson.data.server.id;

    // PATCH
    const patchRes = await app.request(
      `/api/admin/servers/${serverId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({ name: 'Patched Name', interval_s: 20 }),
      },
      testEnv
    );
    expect(patchRes.status).toBe(200);

    const updated = await db.findServerById(testEnv.DB, serverId);
    expect(updated?.name).toBe('Patched Name');
    expect(updated?.interval_s).toBe(20);

    // DELETE
    const deleteRes = await app.request(
      `/api/admin/servers/${serverId}`,
      {
        method: 'DELETE',
        headers: {
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
      },
      testEnv
    );
    expect(deleteRes.status).toBe(200);

    // Soft-deleted: null on normal find, but present in include-deleted
    expect(await db.findServerById(testEnv.DB, serverId)).toBeNull();
    expect(
      await db.findServerByIdIncludeDeleted(testEnv.DB, serverId)
    ).not.toBeNull();
  });

  it('SEC_M1_10_default_token_pepper_consistency_allows_agent_auth_without_env', async () => {
    // Environment without TOKEN_PEPPER configured
    const noPepperEnv = {
      ...env,
      APP_ORIGIN: 'http://localhost:8787',
      // TOKEN_PEPPER is explicitly undefined
      TOKEN_PEPPER: undefined,
    };

    // 1. Create server with noPepperEnv
    const createRes = await app.request(
      '/api/admin/servers',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: noPepperEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${adminSessionId}`,
        },
        body: JSON.stringify({ name: 'Pepper Fallback Server' }),
      },
      noPepperEnv
    );
    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as {
      data: { token: string };
    };
    const token = createJson.data.token;

    // 2. Connect Agent with noPepperEnv -> MUST succeed with 101, not 401 mismatch!
    const wsRes = await app.request(
      '/ws/agent',
      {
        headers: {
          Upgrade: 'websocket',
          Connection: 'Upgrade',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          'Sec-WebSocket-Version': '13',
          Authorization: `Bearer ${token}`,
        },
      },
      noPepperEnv
    );
    expect(wsRes.status).toBe(101);
    expect(wsRes.webSocket).toBeDefined();
  });
});
