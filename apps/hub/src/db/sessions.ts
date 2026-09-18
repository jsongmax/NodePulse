import type { SessionRecord } from './types.js';

export async function findSessionByIdHash(
  db: D1Database,
  idHash: string
): Promise<SessionRecord | null> {
  const query = 'SELECT * FROM sessions WHERE id_hash = ?';
  return db.prepare(query).bind(idHash).first<SessionRecord>();
}

export async function createSession(
  db: D1Database,
  session: SessionRecord
): Promise<void> {
  const query = `
    INSERT INTO sessions (
      id_hash, user_id, created_at, expires_at, last_seen_at, ip_hash, ua
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  await db
    .prepare(query)
    .bind(
      session.id_hash,
      session.user_id,
      session.created_at,
      session.expires_at,
      session.last_seen_at,
      session.ip_hash,
      session.ua
    )
    .run();
}

export async function touchSession(
  db: D1Database,
  idHash: string,
  lastSeenAt: number
): Promise<void> {
  const query = 'UPDATE sessions SET last_seen_at = ? WHERE id_hash = ?';
  await db.prepare(query).bind(lastSeenAt, idHash).run();
}

export async function deleteSession(
  db: D1Database,
  idHash: string
): Promise<void> {
  const query = 'DELETE FROM sessions WHERE id_hash = ?';
  await db.prepare(query).bind(idHash).run();
}

export async function deleteAllUserSessions(
  db: D1Database,
  userId: string
): Promise<void> {
  const query = 'DELETE FROM sessions WHERE user_id = ?';
  await db.prepare(query).bind(userId).run();
}

export async function listUserSessions(
  db: D1Database,
  userId: string
): Promise<SessionRecord[]> {
  const query =
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC';
  const res = await db.prepare(query).bind(userId).all<SessionRecord>();
  return res.results ?? [];
}
