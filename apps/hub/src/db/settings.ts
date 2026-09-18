export async function getSetting(
  db: D1Database,
  key: string
): Promise<string | null> {
  const query = 'SELECT value FROM settings WHERE key = ?';
  const row = await db.prepare(query).bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function getSettings(
  db: D1Database,
  keys: string[]
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  const placeholders = keys.map(() => '?').join(', ');
  const query = `SELECT key, value FROM settings WHERE key IN (${placeholders})`;
  const res = await db
    .prepare(query)
    .bind(...keys)
    .all<{ key: string; value: string }>();

  const result: Record<string, string> = {};
  if (res.results) {
    for (const row of res.results) {
      result[row.key] = row.value;
    }
  }
  return result;
}

export async function getAllSettings(
  db: D1Database
): Promise<Record<string, string>> {
  const query = 'SELECT key, value FROM settings';
  const res = await db.prepare(query).all<{ key: string; value: string }>();
  const result: Record<string, string> = {};
  if (res.results) {
    for (const row of res.results) {
      result[row.key] = row.value;
    }
  }
  return result;
}

export async function setSetting(
  db: D1Database,
  key: string,
  value: string
): Promise<void> {
  const query = `
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `;
  await db.prepare(query).bind(key, value).run();
}
