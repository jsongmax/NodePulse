import type { ServerRecord } from './types.js';

export async function findServerById(
  db: D1Database,
  id: string
): Promise<ServerRecord | null> {
  const query = 'SELECT * FROM servers WHERE id = ? AND deleted_at IS NULL';
  return db.prepare(query).bind(id).first<ServerRecord>();
}

export async function findServerByIdIncludeDeleted(
  db: D1Database,
  id: string
): Promise<ServerRecord | null> {
  const query = 'SELECT * FROM servers WHERE id = ?';
  return db.prepare(query).bind(id).first<ServerRecord>();
}

export async function listServers(
  db: D1Database,
  includeDeleted = false
): Promise<ServerRecord[]> {
  const query = includeDeleted
    ? 'SELECT * FROM servers ORDER BY sort_order ASC, created_at ASC'
    : 'SELECT * FROM servers WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC';
  const res = await db.prepare(query).all<ServerRecord>();
  return res.results ?? [];
}

export async function createServer(
  db: D1Database,
  server: ServerRecord
): Promise<void> {
  const query = `
    INSERT INTO servers (
      id, name, group_id, token_hash, token_prefix, note, sort_order,
      public, geo_lat, geo_lng, geo_label, country, traffic_quota_bytes,
      traffic_reset_day, traffic_direction, interval_s, created_at,
      updated_at, deleted_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `;
  await db
    .prepare(query)
    .bind(
      server.id,
      server.name,
      server.group_id,
      server.token_hash,
      server.token_prefix,
      server.note,
      server.sort_order,
      server.public,
      server.geo_lat,
      server.geo_lng,
      server.geo_label,
      server.country,
      server.traffic_quota_bytes,
      server.traffic_reset_day,
      server.traffic_direction,
      server.interval_s,
      server.created_at,
      server.updated_at,
      server.deleted_at
    )
    .run();
}

export async function updateServer(
  db: D1Database,
  id: string,
  updates: Partial<
    Omit<ServerRecord, 'id' | 'created_at' | 'token_hash' | 'token_prefix'>
  > & { updated_at: number }
): Promise<void> {
  const current = await findServerById(db, id);
  if (!current) throw new Error('Server not found');

  const name = updates.name ?? current.name;
  const group_id =
    updates.group_id !== undefined ? updates.group_id : current.group_id;
  const note = updates.note !== undefined ? updates.note : current.note;
  const sort_order = updates.sort_order ?? current.sort_order;
  const isPublic = updates.public ?? current.public;
  const geo_lat =
    updates.geo_lat !== undefined ? updates.geo_lat : current.geo_lat;
  const geo_lng =
    updates.geo_lng !== undefined ? updates.geo_lng : current.geo_lng;
  const geo_label =
    updates.geo_label !== undefined ? updates.geo_label : current.geo_label;
  const country =
    updates.country !== undefined ? updates.country : current.country;
  const traffic_quota_bytes =
    updates.traffic_quota_bytes !== undefined
      ? updates.traffic_quota_bytes
      : current.traffic_quota_bytes;
  const traffic_reset_day =
    updates.traffic_reset_day !== undefined
      ? updates.traffic_reset_day
      : current.traffic_reset_day;
  const traffic_direction =
    updates.traffic_direction !== undefined
      ? updates.traffic_direction
      : current.traffic_direction;
  const interval_s = updates.interval_s ?? current.interval_s;
  const updated_at = updates.updated_at;

  const query = `
    UPDATE servers SET
      name = ?, group_id = ?, note = ?, sort_order = ?, public = ?,
      geo_lat = ?, geo_lng = ?, geo_label = ?, country = ?,
      traffic_quota_bytes = ?, traffic_reset_day = ?, traffic_direction = ?,
      interval_s = ?, updated_at = ?
    WHERE id = ? AND deleted_at IS NULL
  `;
  await db
    .prepare(query)
    .bind(
      name,
      group_id,
      note,
      sort_order,
      isPublic,
      geo_lat,
      geo_lng,
      geo_label,
      country,
      traffic_quota_bytes,
      traffic_reset_day,
      traffic_direction,
      interval_s,
      updated_at,
      id
    )
    .run();
}

export async function softDeleteServer(
  db: D1Database,
  id: string,
  now: number
): Promise<void> {
  const query =
    'UPDATE servers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL';
  await db.prepare(query).bind(now, now, id).run();
}

export async function rotateServerToken(
  db: D1Database,
  id: string,
  tokenHash: ArrayBuffer | Uint8Array,
  tokenPrefix: string,
  now: number
): Promise<void> {
  const query =
    'UPDATE servers SET token_hash = ?, token_prefix = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL';
  await db.prepare(query).bind(tokenHash, tokenPrefix, now, id).run();
}
