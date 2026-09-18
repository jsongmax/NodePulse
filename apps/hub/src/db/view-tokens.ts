import type { ViewTokenRecord } from './types.js';

export async function findViewTokenByHash(
  db: D1Database,
  tokenHash: string
): Promise<ViewTokenRecord | null> {
  const query =
    'SELECT * FROM view_tokens WHERE token_hash = ? AND revoked_at IS NULL';
  return db.prepare(query).bind(tokenHash).first<ViewTokenRecord>();
}

export async function listViewTokens(
  db: D1Database
): Promise<ViewTokenRecord[]> {
  const query = 'SELECT * FROM view_tokens ORDER BY created_at DESC';
  const res = await db.prepare(query).all<ViewTokenRecord>();
  return res.results ?? [];
}

export async function createViewToken(
  db: D1Database,
  token: ViewTokenRecord
): Promise<void> {
  const query = `
    INSERT INTO view_tokens (
      id, token_hash, name, scope, created_at, expires_at, revoked_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db
    .prepare(query)
    .bind(
      token.id,
      token.token_hash,
      token.name,
      token.scope,
      token.created_at,
      token.expires_at,
      token.revoked_at,
      token.last_used_at
    )
    .run();
}

export async function revokeViewToken(
  db: D1Database,
  id: string,
  now: number
): Promise<void> {
  const query = 'UPDATE view_tokens SET revoked_at = ? WHERE id = ?';
  await db.prepare(query).bind(now, id).run();
}

export async function touchViewToken(
  db: D1Database,
  id: string,
  now: number
): Promise<void> {
  const query = 'UPDATE view_tokens SET last_used_at = ? WHERE id = ?';
  await db.prepare(query).bind(now, id).run();
}
