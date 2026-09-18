import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import app from '../src/index.js';
import * as db from '../src/db/index.js';
import { getCookie, SETUP_COOKIE_NAME } from '../src/auth/cookies.js';

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

describe('Setup Flow (/api/setup/* and /setup)', () => {
  const testEnv = {
    ...env,
    SETUP_TOKEN:
      'test_setup_token_0123456789abcdef0123456789abcdef0123456789abcdef',
    APP_ORIGIN: 'http://localhost:8787',
  };

  const getHeaders = (ipSuffix = 1) => ({
    'Content-Type': 'application/json',
    Origin: testEnv.APP_ORIGIN,
    'X-NP-Request': '1',
    'CF-Connecting-IP': `192.0.2.${ipSuffix}`,
  });

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, migrations);
  });

  it('setup_status_returns_not_done_initially', async () => {
    const res = await app.request('/api/setup/status', {}, testEnv);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { setup_done: boolean };
    };
    expect(json.ok).toBe(true);
    expect(json.data.setup_done).toBe(false);
  });

  it('setup_token_verification_rejects_invalid_token', async () => {
    const res = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: getHeaders(1),
        body: JSON.stringify({ token: 'wrong-token' }),
      },
      testEnv
    );
    expect(res.status).toBe(401);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('unauthorized');
  });

  it('setup_token_verification_accepts_valid_token_and_sets_setup_cookie', async () => {
    const res = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: getHeaders(2),
        body: JSON.stringify({ token: testEnv.SETUP_TOKEN }),
      },
      testEnv
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(`${SETUP_COOKIE_NAME}=`);
    expect(setCookie).toContain('Max-Age=600');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('setup_passkey_options_requires_valid_setup_cookie', async () => {
    // 1. Without cookie -> 401
    const noCookieRes = await app.request(
      '/api/setup/passkey/options',
      {
        method: 'POST',
        headers: getHeaders(3),
      },
      testEnv
    );
    expect(noCookieRes.status).toBe(401);

    // 2. Get cookie first
    const verifyRes = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: getHeaders(3),
        body: JSON.stringify({ token: testEnv.SETUP_TOKEN }),
      },
      testEnv
    );
    const setCookie = verifyRes.headers.get('set-cookie');
    const setupToken = getCookie(setCookie, SETUP_COOKIE_NAME);

    // 3. With cookie -> 200 with options
    const optionsRes = await app.request(
      '/api/setup/passkey/options',
      {
        method: 'POST',
        headers: {
          ...getHeaders(3),
          Cookie: `${SETUP_COOKIE_NAME}=${setupToken}`,
        },
      },
      testEnv
    );
    expect(optionsRes.status).toBe(200);
    const optionsJson = (await optionsRes.json()) as {
      ok: boolean;
      data: { rp: { name: string; id: string }; challenge: string };
    };
    expect(optionsJson.ok).toBe(true);
    expect(optionsJson.data.rp.name).toBe('NodePulse');
    expect(optionsJson.data.challenge).toBeDefined();
  });

  it('SEC_M1_07_repeated_passkey_options_requests_do_not_throw_primary_key_conflict', async () => {
    // 1. Get setup cookie
    const verifyRes = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: getHeaders(4),
        body: JSON.stringify({ token: testEnv.SETUP_TOKEN }),
      },
      testEnv
    );
    const setCookie = verifyRes.headers.get('set-cookie');
    const setupToken = getCookie(setCookie, SETUP_COOKIE_NAME);

    // 2. First call
    const res1 = await app.request(
      '/api/setup/passkey/options',
      {
        method: 'POST',
        headers: {
          ...getHeaders(4),
          Cookie: `${SETUP_COOKIE_NAME}=${setupToken}`,
        },
      },
      testEnv
    );
    expect(res1.status).toBe(200);

    // 3. Second call immediately (repeated challenge with same id setup:admin)
    const res2 = await app.request(
      '/api/setup/passkey/options',
      {
        method: 'POST',
        headers: {
          ...getHeaders(4),
          Cookie: `${SETUP_COOKIE_NAME}=${setupToken}`,
        },
      },
      testEnv
    );
    // Must succeed with 200, never 500 SQLite constraint error
    expect(res2.status).toBe(200);
    const json2 = (await res2.json()) as { ok: boolean };
    expect(json2.ok).toBe(true);
  });

  it('setup_done_causes_setup_endpoints_and_page_to_return_404', async () => {
    // Set setup_done to 1
    await db.setSetting(testEnv.DB, 'setup_done', '1');

    // GET /setup page must return 404
    const pageRes = await app.request('/setup', {}, testEnv);
    expect(pageRes.status).toBe(404);

    // POST /api/setup/verify must return 404
    const verifyRes = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: getHeaders(5),
        body: JSON.stringify({ token: testEnv.SETUP_TOKEN }),
      },
      testEnv
    );
    expect(verifyRes.status).toBe(404);

    // POST /api/setup/passkey/options must return 404
    const optionsRes = await app.request(
      '/api/setup/passkey/options',
      {
        method: 'POST',
        headers: getHeaders(5),
      },
      testEnv
    );
    expect(optionsRes.status).toBe(404);

    // Status returns setup_done: true
    const statusRes = await app.request('/api/setup/status', {}, testEnv);
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as {
      ok: boolean;
      data: { setup_done: boolean };
    };
    expect(statusJson.data.setup_done).toBe(true);
  });
});
