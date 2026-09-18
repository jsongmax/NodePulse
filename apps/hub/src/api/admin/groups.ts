import { Hono } from 'hono';
import {
  createGroupRequestSchema,
  updateGroupRequestSchema,
} from '@nodepulse/protocol';
import type { Env } from '../../types.js';
import * as db from '../../db/index.js';
import { requireAdmin } from '../../auth/middleware.js';
import { randomTokenHex } from '../../auth/crypto.js';

export const adminGroupsRouter = new Hono<{ Bindings: Env }>();

adminGroupsRouter.use('*', requireAdmin);

// GET /api/admin/groups
adminGroupsRouter.get('/', async (c) => {
  const groups = await db.listGroups(c.env.DB);
  return c.json({
    ok: true,
    data: groups,
  });
});

// POST /api/admin/groups
adminGroupsRouter.post('/', async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsed = createGroupRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: { code: 'validation_failed', message: 'Invalid group input' },
      },
      400
    );
  }

  const groupId = `grp_${randomTokenHex(6)}`;
  await db.createGroup(c.env.DB, {
    id: groupId,
    name: parsed.data.name,
    sort_order: parsed.data.sort_order ?? 0,
  });

  return c.json({
    ok: true,
    data: { id: groupId, name: parsed.data.name },
  });
});

// PATCH /api/admin/groups/:id
adminGroupsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => null);
  const parsed = updateGroupRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: { code: 'validation_failed', message: 'Invalid update input' },
      },
      400
    );
  }

  await db.updateGroup(c.env.DB, id, parsed.data);
  return c.json({
    ok: true,
    data: { updated: true },
  });
});

// DELETE /api/admin/groups/:id
adminGroupsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.deleteGroup(c.env.DB, id);
  return c.json({
    ok: true,
    data: { deleted: true },
  });
});
