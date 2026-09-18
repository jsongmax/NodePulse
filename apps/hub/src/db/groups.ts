import type { GroupRecord } from './types.js';

export async function listGroups(db: D1Database): Promise<GroupRecord[]> {
  const query = 'SELECT * FROM groups ORDER BY sort_order ASC, name ASC';
  const res = await db.prepare(query).all<GroupRecord>();
  return res.results ?? [];
}

export async function findGroupById(
  db: D1Database,
  id: string
): Promise<GroupRecord | null> {
  const query = 'SELECT * FROM groups WHERE id = ?';
  return db.prepare(query).bind(id).first<GroupRecord>();
}

export async function createGroup(
  db: D1Database,
  group: GroupRecord
): Promise<void> {
  const query = 'INSERT INTO groups (id, name, sort_order) VALUES (?, ?, ?)';
  await db.prepare(query).bind(group.id, group.name, group.sort_order).run();
}

export async function updateGroup(
  db: D1Database,
  id: string,
  updates: Partial<Omit<GroupRecord, 'id'>>
): Promise<void> {
  const current = await findGroupById(db, id);
  if (!current) throw new Error('Group not found');
  const name = updates.name ?? current.name;
  const sort_order = updates.sort_order ?? current.sort_order;
  const query = 'UPDATE groups SET name = ?, sort_order = ? WHERE id = ?';
  await db.prepare(query).bind(name, sort_order, id).run();
}

export async function deleteGroup(db: D1Database, id: string): Promise<void> {
  // Clear group_id from any servers referencing this group
  await db
    .prepare('UPDATE servers SET group_id = NULL WHERE group_id = ?')
    .bind(id)
    .run();
  await db.prepare('DELETE FROM groups WHERE id = ?').bind(id).run();
}
