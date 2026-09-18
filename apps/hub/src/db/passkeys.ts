import type { PasskeyRecord } from './types.js';

export async function listPasskeysByUser(
  db: D1Database,
  userId: string
): Promise<PasskeyRecord[]> {
  const query =
    'SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at DESC';
  const res = await db.prepare(query).bind(userId).all<PasskeyRecord>();
  return res.results ?? [];
}

export async function findPasskeyById(
  db: D1Database,
  id: string
): Promise<PasskeyRecord | null> {
  const query = 'SELECT * FROM passkeys WHERE id = ?';
  return db.prepare(query).bind(id).first<PasskeyRecord>();
}

export async function findPasskeyByCredentialId(
  db: D1Database,
  credentialId: ArrayBuffer | Uint8Array
): Promise<PasskeyRecord | null> {
  const query = 'SELECT * FROM passkeys WHERE credential_id = ?';
  return db.prepare(query).bind(credentialId).first<PasskeyRecord>();
}

export async function createPasskey(
  db: D1Database,
  passkey: PasskeyRecord
): Promise<void> {
  const query = `
    INSERT INTO passkeys (
      id, user_id, credential_id, public_key, counter,
      transports, aaguid, backed_up, name, created_at, last_used_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db
    .prepare(query)
    .bind(
      passkey.id,
      passkey.user_id,
      passkey.credential_id,
      passkey.public_key,
      passkey.counter,
      passkey.transports,
      passkey.aaguid,
      passkey.backed_up,
      passkey.name,
      passkey.created_at,
      passkey.last_used_at
    )
    .run();
}

export async function updatePasskeyCounter(
  db: D1Database,
  id: string,
  counter: number,
  lastUsedAt: number
): Promise<void> {
  const query =
    'UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?';
  await db.prepare(query).bind(counter, lastUsedAt, id).run();
}

export async function deletePasskey(
  db: D1Database,
  id: string,
  userId: string
): Promise<void> {
  const query = 'DELETE FROM passkeys WHERE id = ? AND user_id = ?';
  await db.prepare(query).bind(id, userId).run();
}

export async function countPasskeysByUser(
  db: D1Database,
  userId: string
): Promise<number> {
  const query = 'SELECT COUNT(*) as cnt FROM passkeys WHERE user_id = ?';
  const row = await db.prepare(query).bind(userId).first<{ cnt: number }>();
  return row?.cnt ?? 0;
}
