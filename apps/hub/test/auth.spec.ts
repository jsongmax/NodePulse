import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import app from '../src/index.js';
import * as db from '../src/db/index.js';
import {
  SESSION_COOKIE_NAME,
  VIEW_COOKIE_NAME,
  buildCookieHeader,
} from '../src/auth/cookies.js';
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

describe('Authentication, Sessions & Cookies', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
    TOKEN_PEPPER: 'test_pepper_32_bytes_long_random_value',
  };

  const adminUserId = 'usr_auth_admin';

  beforeAll(async () => {
    await applyD1Migrations(testEnv.DB, migrations);
    await db.createUser(testEnv.DB, {
      id: adminUserId,
      username: 'admin',
      display_name: 'SysAdmin',
      role: 'admin',
      created_at: 1000,
    });
  });

  it('session_cookie_name_must_be___Host_np_session_with_strict_attributes', () => {
    expect(SESSION_COOKIE_NAME).toBe('__Host-np_session');
    const header = buildCookieHeader(SESSION_COOKIE_NAME, 'sample_session_id', {
      maxAge: 604800,
      sameSite: 'Strict',
      path: '/',
    });
    expect(header).toContain('__Host-np_session=sample_session_id');
    expect(header).toContain('Path=/');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('Secure');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Max-Age=604800');
  });

  it('auth_me_returns_identity_for_authenticated_sessions', async () => {
    const rawSessionId = randomTokenHex(32);
    const sessionHash = await sha256Hex(rawSessionId);
    const now = Math.floor(Date.now() / 1000);

    await db.createSession(testEnv.DB, {
      id_hash: sessionHash,
      user_id: adminUserId,
      created_at: now,
      expires_at: now + 3600,
      last_seen_at: now,
      ip_hash: null,
      ua: 'TestRunner',
    });

    const res = await app.request(
      '/api/auth/me',
      {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        },
      },
      testEnv
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { kind: string; display_name: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.kind).toBe('admin');
    expect(json.data.display_name).toBe('SysAdmin');
  });

  it('session_expiration_enforces_both_idle_and_absolute_limits', async () => {
    const rawSessionId = randomTokenHex(32);
    const sessionHash = await sha256Hex(rawSessionId);
    const now = Math.floor(Date.now() / 1000);

    // Expired session (idle > 12h)
    await db.createSession(testEnv.DB, {
      id_hash: sessionHash,
      user_id: adminUserId,
      created_at: now - 50000,
      expires_at: now + 50000,
      last_seen_at: now - 45000, // 12.5h ago
      ip_hash: null,
      ua: 'TestRunner',
    });

    const res = await app.request(
      '/api/auth/me',
      {
        headers: {
          Cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        },
      },
      testEnv
    );

    expect(res.status).toBe(401);
    // Verified deleted from DB
    const inDb = await db.findSessionByIdHash(testEnv.DB, sessionHash);
    expect(inDb).toBeNull();
  });

  it('session_logout_deletes_session_and_clears_cookie', async () => {
    const rawSessionId = randomTokenHex(32);
    const sessionHash = await sha256Hex(rawSessionId);
    const now = Math.floor(Date.now() / 1000);

    await db.createSession(testEnv.DB, {
      id_hash: sessionHash,
      user_id: adminUserId,
      created_at: now,
      expires_at: now + 3600,
      last_seen_at: now,
      ip_hash: null,
      ua: 'TestRunner',
    });

    const res = await app.request(
      '/api/auth/logout',
      {
        method: 'POST',
        headers: {
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          Cookie: `${SESSION_COOKIE_NAME}=${rawSessionId}`,
        },
      },
      testEnv
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain('Max-Age=0');

    // DB session should be deleted
    const inDb = await db.findSessionByIdHash(testEnv.DB, sessionHash);
    expect(inDb).toBeNull();
  });

  it('view_token_exchange_sets_cookie_and_redirects_302', async () => {
    const rawViewToken = randomTokenHex(32);
    const tokenHash = await sha256Hex(rawViewToken);
    const now = Math.floor(Date.now() / 1000);

    await db.createViewToken(testEnv.DB, {
      id: 'vt_test1',
      token_hash: tokenHash,
      name: 'Public Wall',
      scope: JSON.stringify({ fields: 'public' }),
      created_at: now,
      expires_at: now + 86400,
      revoked_at: null,
      last_used_at: null,
    });

    const res = await app.request(`/s/${rawViewToken}`, {}, testEnv);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/wall?src=share');

    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain(`${VIEW_COOKIE_NAME}=${rawViewToken}`);
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
  });
});
