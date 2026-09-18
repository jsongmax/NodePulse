import type { AlertRuleRecord, NotifyChannelRecord, AlertEventRecord } from './types.js';

// --- Alert Rules ---

export async function listAlertRules(db: D1Database): Promise<AlertRuleRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM alert_rules ORDER BY created_at DESC')
    .all<AlertRuleRecord>();
  return results || [];
}

export async function findAlertRuleById(
  db: D1Database,
  id: string
): Promise<AlertRuleRecord | null> {
  return db
    .prepare('SELECT * FROM alert_rules WHERE id = ?')
    .bind(id)
    .first<AlertRuleRecord>();
}

export async function insertAlertRule(
  db: D1Database,
  rule: AlertRuleRecord
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_rules (
        id, name, enabled, metric, op, threshold, duration_s, server_filter, channels, severity, cooldown_s, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      rule.id,
      rule.name,
      rule.enabled,
      rule.metric,
      rule.op,
      rule.threshold,
      rule.duration_s,
      rule.server_filter,
      rule.channels,
      rule.severity,
      rule.cooldown_s,
      rule.created_at,
      rule.updated_at
    )
    .run();
}

export async function updateAlertRule(
  db: D1Database,
  id: string,
  fields: Partial<Omit<AlertRuleRecord, 'id' | 'created_at'>>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  const sql = `UPDATE alert_rules SET ${setClauses.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...values).run();
}

export async function deleteAlertRule(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM alert_rules WHERE id = ?').bind(id).run();
}

// --- Notify Channels ---

export async function listNotifyChannels(db: D1Database): Promise<NotifyChannelRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM notify_channels ORDER BY created_at DESC')
    .all<NotifyChannelRecord>();
  return results || [];
}

export async function findNotifyChannelById(
  db: D1Database,
  id: string
): Promise<NotifyChannelRecord | null> {
  return db
    .prepare('SELECT * FROM notify_channels WHERE id = ?')
    .bind(id)
    .first<NotifyChannelRecord>();
}

export async function insertNotifyChannel(
  db: D1Database,
  channel: NotifyChannelRecord
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notify_channels (id, type, name, config_enc, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      channel.id,
      channel.type,
      channel.name,
      channel.config_enc,
      channel.enabled,
      channel.created_at
    )
    .run();
}

export async function updateNotifyChannel(
  db: D1Database,
  id: string,
  fields: Partial<Omit<NotifyChannelRecord, 'id' | 'created_at'>>
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  const sql = `UPDATE notify_channels SET ${setClauses.join(', ')} WHERE id = ?`;
  await db.prepare(sql).bind(...values).run();
}

export async function deleteNotifyChannel(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM notify_channels WHERE id = ?').bind(id).run();
}

// --- Alert Events ---

export async function recordAlertEvent(
  db: D1Database,
  event: AlertEventRecord
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_events (id, rule_id, server_id, severity, state, value, started_at, resolved_at, notified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      event.id,
      event.rule_id,
      event.server_id,
      event.severity,
      event.state,
      event.value,
      event.started_at,
      event.resolved_at,
      event.notified
    )
    .run();
}

export async function listRecentAlertEvents(
  db: D1Database,
  limit = 50
): Promise<AlertEventRecord[]> {
  const { results } = await db
    .prepare('SELECT * FROM alert_events ORDER BY started_at DESC LIMIT ?')
    .bind(limit)
    .all<AlertEventRecord>();
  return results || [];
}
