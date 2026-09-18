import { Hono } from 'hono';
import {
  createServerRequestSchema,
  updateServerRequestSchema,
} from '@nodepulse/protocol';
import type { Env } from '../../types.js';
import * as db from '../../db/index.js';
import {
  hmacSha256,
  randomBytes,
  toBase64Url,
  hashIp,
} from '../../auth/crypto.js';
import { requireAdmin } from '../../auth/middleware.js';
import { getClientIp } from '../../middleware/ratelimit.js';

const BASE32_CHARS = '0123456789abcdefghjkmnpqrstvwxyz';

export function generateServerId(length = 12): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) {
    const idx = bytes[i]! % 32;
    id += BASE32_CHARS[idx];
  }
  return id;
}

export async function generateServerToken(
  serverId: string,
  pepper: string
): Promise<{ fullToken: string; tokenHash: Uint8Array; tokenPrefix: string }> {
  const secretBytes = randomBytes(32);
  const secretBase64Url = toBase64Url(secretBytes);
  const fullToken = `np1.${serverId}.${secretBase64Url}`;
  const tokenHash = await hmacSha256(pepper, secretBase64Url);
  const tokenPrefix = fullToken.slice(0, 6);
  return { fullToken, tokenHash, tokenPrefix };
}

export const adminServersRouter = new Hono<{ Bindings: Env }>();

adminServersRouter.use('*', requireAdmin);

// GET /api/admin/servers
adminServersRouter.get('/', async (c) => {
  const servers = await db.listServers(c.env.DB, false);

  // Return server list with token_prefix, without full token_hash
  const items = servers.map((s) => ({
    id: s.id,
    name: s.name,
    group_id: s.group_id,
    token_prefix: s.token_prefix,
    note: s.note,
    sort_order: s.sort_order,
    public: s.public === 1,
    geo_lat: s.geo_lat,
    geo_lng: s.geo_lng,
    geo_label: s.geo_label,
    country: s.country,
    traffic_quota_bytes: s.traffic_quota_bytes,
    traffic_reset_day: s.traffic_reset_day,
    traffic_direction: s.traffic_direction,
    interval_s: s.interval_s,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));

  return c.json({
    ok: true,
    data: items,
  });
});

// POST /api/admin/servers
adminServersRouter.post('/', async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsed = createServerRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid server input',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const serverId = generateServerId(12);
  const pepper = c.env.TOKEN_PEPPER || 'default_pepper_for_tests';
  const { fullToken, tokenHash, tokenPrefix } = await generateServerToken(
    serverId,
    pepper
  );

  const input = parsed.data;
  const serverRecord: db.ServerRecord = {
    id: serverId,
    name: input.name,
    group_id: input.group_id ?? null,
    token_hash: tokenHash,
    token_prefix: tokenPrefix,
    note: input.note ?? null,
    sort_order: input.sort_order ?? 0,
    public: input.public ? 1 : 0,
    geo_lat: input.geo_lat ?? null,
    geo_lng: input.geo_lng ?? null,
    geo_label: input.geo_label ?? null,
    country: input.country ?? null,
    traffic_quota_bytes: input.traffic_quota_bytes ?? null,
    traffic_reset_day: input.traffic_reset_day ?? null,
    traffic_direction: input.traffic_direction ?? null,
    interval_s: input.interval_s ?? 10,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.createServer(c.env.DB, serverRecord);

  // Audit log
  const auth = c.get('auth');
  const ip = getClientIp(c);
  const ipHash = await hashIp(ip, pepper);
  await db.recordAudit(c.env.DB, {
    ts: now,
    user_id: auth?.userId ?? null,
    action: 'server_created',
    target: serverId,
    details: `Created server "${input.name}"`,
    ip_hash: ipHash,
  });

  // Sync DO if HUB is bound
  try {
    const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
    await hubStub.syncConfig({ action: 'server_created', serverId });
  } catch {
    // DO may not be running in tests
  }

  const installCommand = `curl -fsSL ${c.env.APP_ORIGIN}/install.sh -o /tmp/np-install.sh && sudo NP_HUB="${c.env.APP_ORIGIN.replace(/^http/, 'ws')}/ws/agent" NP_TOKEN="${fullToken}" bash /tmp/np-install.sh`;

  return c.json({
    ok: true,
    data: {
      server: {
        id: serverRecord.id,
        name: serverRecord.name,
        token_prefix: serverRecord.token_prefix,
        interval_s: serverRecord.interval_s,
      },
      token: fullToken, // Only returned once!
      install_command: installCommand,
    },
  });
});

// PATCH /api/admin/servers/:id
adminServersRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const rawBody = await c.req.json().catch(() => null);
  const parsed = updateServerRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid update payload',
        },
      },
      400
    );
  }

  const existing = await db.findServerById(c.env.DB, id);
  if (!existing) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Server not found' },
      },
      404
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const input = parsed.data;
  await db.updateServer(c.env.DB, id, {
    name: input.name,
    group_id: input.group_id,
    note: input.note,
    sort_order: input.sort_order,
    public: input.public !== undefined ? (input.public ? 1 : 0) : undefined,
    geo_lat: input.geo_lat,
    geo_lng: input.geo_lng,
    geo_label: input.geo_label,
    country: input.country,
    traffic_quota_bytes: input.traffic_quota_bytes,
    traffic_reset_day: input.traffic_reset_day,
    traffic_direction: input.traffic_direction,
    interval_s: input.interval_s,
    updated_at: now,
  });

  const auth = c.get('auth');
  const pepper = c.env.TOKEN_PEPPER || 'default_pepper';
  const ip = getClientIp(c);
  const ipHash = await hashIp(ip, pepper);
  await db.recordAudit(c.env.DB, {
    ts: now,
    user_id: auth?.userId ?? null,
    action: 'server_updated',
    target: id,
    details: 'Server metadata updated',
    ip_hash: ipHash,
  });

  try {
    const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
    await hubStub.syncConfig({ action: 'server_updated', serverId: id });
  } catch {
    // Ignore in tests
  }

  return c.json({
    ok: true,
    data: { updated: true },
  });
});

// DELETE /api/admin/servers/:id
adminServersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findServerById(c.env.DB, id);
  if (!existing) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Server not found' },
      },
      404
    );
  }

  const now = Math.floor(Date.now() / 1000);
  await db.softDeleteServer(c.env.DB, id, now);

  const auth = c.get('auth');
  const pepper = c.env.TOKEN_PEPPER || 'default_pepper';
  const ip = getClientIp(c);
  const ipHash = await hashIp(ip, pepper);
  await db.recordAudit(c.env.DB, {
    ts: now,
    user_id: auth?.userId ?? null,
    action: 'server_deleted',
    target: id,
    details: `Deleted server "${existing.name}"`,
    ip_hash: ipHash,
  });

  try {
    const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
    await hubStub.syncConfig({ action: 'server_deleted', serverId: id });
  } catch {
    // Ignore in tests
  }

  return c.json({
    ok: true,
    data: { deleted: true },
  });
});

// POST /api/admin/servers/:id/token/rotate
adminServersRouter.post('/:id/token/rotate', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findServerById(c.env.DB, id);
  if (!existing) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Server not found' },
      },
      404
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const pepper = c.env.TOKEN_PEPPER || 'default_pepper';
  const { fullToken, tokenHash, tokenPrefix } = await generateServerToken(
    id,
    pepper
  );

  await db.rotateServerToken(c.env.DB, id, tokenHash, tokenPrefix, now);

  const auth = c.get('auth');
  const ip = getClientIp(c);
  const ipHash = await hashIp(ip, pepper);
  await db.recordAudit(c.env.DB, {
    ts: now,
    user_id: auth?.userId ?? null,
    action: 'token_rotated',
    target: id,
    details: 'Rotated agent token',
    ip_hash: ipHash,
  });

  try {
    const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
    await hubStub.syncConfig({ action: 'token_rotated', serverId: id });
  } catch {
    // Ignore in tests
  }

  return c.json({
    ok: true,
    data: {
      token: fullToken, // Only returned once!
      token_prefix: tokenPrefix,
    },
  });
});

// GET /api/admin/servers/:id/install
adminServersRouter.get('/:id/install', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findServerById(c.env.DB, id);
  if (!existing) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Server not found' },
      },
      404
    );
  }

  const installCmd = `curl -fsSL ${c.env.APP_ORIGIN}/install.sh -o /tmp/np-install.sh && sudo NP_HUB="${c.env.APP_ORIGIN.replace(/^http/, 'ws')}/ws/agent" bash /tmp/np-install.sh`;

  return c.json({
    ok: true,
    data: {
      install_command: installCmd,
    },
  });
});
