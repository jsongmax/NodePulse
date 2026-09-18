import type { UserRecord } from './types.js';

export async function findUserById(
  db: D1Database,
  id: string
): Promise<UserRecord | null> {
  const query = 'SELECT * FROM users WHERE id = ?';
  return db.prepare(query).bind(id).first<UserRecord>();
}

export async function findUserByUsername(
  db: D1Database,
  username: string
): Promise<UserRecord | null> {
  const query = 'SELECT * FROM users WHERE username = ?';
  return db.prepare(query).bind(username).first<UserRecord>();
}

export async function createUser(
  db: D1Database,
  user: UserRecord
): Promise<void> {
  const query = `
    INSERT INTO users (id, username, display_name, role, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      role = excluded.role
  `;
  await db
    .prepare(query)
    .bind(user.id, user.username, user.display_name, user.role, user.created_at)
    .run();
}

export async function countUsers(db: D1Database): Promise<number> {
  const query = 'SELECT COUNT(*) as cnt FROM users';
  const row = await db.prepare(query).first<{ cnt: number }>();
  return row?.cnt ?? 0;
}
