import { describe, expect, it, beforeAll } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import * as db from '../src/db/index.js';

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

describe('D1 Repository Layer', () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, migrations);
  });

  it('handles settings CRUD and bulk fetch', async () => {
    await db.setSetting(env.DB, 'site_name', 'My Pulse');
    await db.setSetting(env.DB, 'setup_done', '1');

    expect(await db.getSetting(env.DB, 'site_name')).toBe('My Pulse');
    const settings = await db.getSettings(env.DB, ['site_name', 'setup_done']);
    expect(settings).toEqual({ site_name: 'My Pulse', setup_done: '1' });
  });

  it('handles users and passkeys CRUD', async () => {
    const user = {
      id: 'usr_admin',
      username: 'admin',
      display_name: 'Administrator',
      role: 'admin' as const,
      created_at: 1000,
    };
    await db.createUser(env.DB, user);
    expect(await db.countUsers(env.DB)).toBe(1);

    const credId = new Uint8Array([1, 2, 3, 4]);
    const pubKey = new Uint8Array([5, 6, 7, 8]);
    await db.createPasskey(env.DB, {
      id: 'pk_1',
      user_id: user.id,
      credential_id: credId,
      public_key: pubKey,
      counter: 0,
      transports: '["internal"]',
      aaguid: 'test-aaguid',
      backed_up: 1,
      name: 'YubiKey',
      created_at: 1000,
      last_used_at: null,
    });

    const found = await db.findPasskeyByCredentialId(env.DB, credId);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('YubiKey');

    await db.updatePasskeyCounter(env.DB, 'pk_1', 10, 1050);
    const updated = await db.findPasskeyById(env.DB, 'pk_1');
    expect(updated?.counter).toBe(10);
    expect(updated?.last_used_at).toBe(1050);
  });

  it('handles sessions and view tokens', async () => {
    await db.createSession(env.DB, {
      id_hash: 'hash123',
      user_id: 'usr_admin',
      created_at: 1000,
      expires_at: 2000,
      last_seen_at: 1000,
      ip_hash: 'iphash',
      ua: 'Mozilla',
    });

    const session = await db.findSessionByIdHash(env.DB, 'hash123');
    expect(session).not.toBeNull();
    expect(session?.user_id).toBe('usr_admin');

    await db.deleteSession(env.DB, 'hash123');
    expect(await db.findSessionByIdHash(env.DB, 'hash123')).toBeNull();
  });

  it('handles servers CRUD, rotation, and soft delete', async () => {
    const srv = {
      id: 'srv_tokyo1',
      name: 'Tokyo 1',
      group_id: null,
      token_hash: new Uint8Array([9, 9, 9]),
      token_prefix: 'np1.sr',
      note: 'Primary',
      sort_order: 1,
      public: 0,
      geo_lat: 35.68,
      geo_lng: 139.76,
      geo_label: 'Tokyo',
      country: 'JP',
      traffic_quota_bytes: 1000000000,
      traffic_reset_day: 1,
      traffic_direction: 'both',
      interval_s: 10,
      created_at: 1000,
      updated_at: 1000,
      deleted_at: null,
    };

    await db.createServer(env.DB, srv);
    const found = await db.findServerById(env.DB, 'srv_tokyo1');
    expect(found?.name).toBe('Tokyo 1');

    await db.updateServer(env.DB, 'srv_tokyo1', {
      name: 'Tokyo 1 (Updated)',
      updated_at: 1100,
    });
    const updated = await db.findServerById(env.DB, 'srv_tokyo1');
    expect(updated?.name).toBe('Tokyo 1 (Updated)');

    await db.softDeleteServer(env.DB, 'srv_tokyo1', 1200);
    expect(await db.findServerById(env.DB, 'srv_tokyo1')).toBeNull();
    expect(
      await db.findServerByIdIncludeDeleted(env.DB, 'srv_tokyo1')
    ).not.toBeNull();
  });
});
