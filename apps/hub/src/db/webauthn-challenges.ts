export async function saveChallenge(
  db: D1Database,
  id: string,
  challenge: ArrayBuffer | Uint8Array,
  kind: string,
  expiresAt: number
): Promise<void> {
  const query = `
    INSERT INTO webauthn_challenges (id, challenge, kind, expires_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      challenge = excluded.challenge,
      kind = excluded.kind,
      expires_at = excluded.expires_at
  `;
  await db.prepare(query).bind(id, challenge, kind, expiresAt).run();
}

export async function consumeChallenge(
  db: D1Database,
  id: string,
  kind: string,
  now: number
): Promise<Uint8Array | null> {
  const selectQuery = `
    SELECT challenge, expires_at FROM webauthn_challenges
    WHERE id = ? AND kind = ?
  `;
  const row = await db
    .prepare(selectQuery)
    .bind(id, kind)
    .first<{ challenge: ArrayBuffer | Uint8Array; expires_at: number }>();

  if (!row) return null;

  // Always delete challenge on attempt (single use)
  await db
    .prepare('DELETE FROM webauthn_challenges WHERE id = ?')
    .bind(id)
    .run();

  if (row.expires_at < now) {
    return null; // Expired
  }

  return row.challenge instanceof Uint8Array
    ? row.challenge
    : new Uint8Array(row.challenge);
}
