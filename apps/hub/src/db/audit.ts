import type { AuditRecord } from './types.js';

export async function recordAudit(
  db: D1Database,
  item: AuditRecord
): Promise<void> {
  const query = `
    INSERT INTO audit_log (ts, user_id, action, target, details, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `;
  await db
    .prepare(query)
    .bind(
      item.ts,
      item.user_id,
      item.action,
      item.target,
      item.details,
      item.ip_hash
    )
    .run();
}

export async function listAuditLogs(
  db: D1Database,
  limit = 50,
  cursor?: number
): Promise<{
  items: (AuditRecord & { id: number })[];
  next_cursor: number | null;
}> {
  let query: string;
  let res: D1Result<AuditRecord & { id: number }>;

  if (cursor) {
    query = 'SELECT * FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT ?';
    res = await db
      .prepare(query)
      .bind(cursor, limit + 1)
      .all<AuditRecord & { id: number }>();
  } else {
    query = 'SELECT * FROM audit_log ORDER BY id DESC LIMIT ?';
    res = await db
      .prepare(query)
      .bind(limit + 1)
      .all<AuditRecord & { id: number }>();
  }

  const rows = res.results ?? [];
  let next_cursor: number | null = null;
  if (rows.length > limit) {
    const nextItem = rows.pop();
    next_cursor = nextItem?.id ?? null;
  }

  return {
    items: rows,
    next_cursor,
  };
}
