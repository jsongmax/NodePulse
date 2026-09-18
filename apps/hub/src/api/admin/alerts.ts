import { Hono } from 'hono';
import type { Env } from '../../types.js';
import * as db from '../../db/index.js';
import { requireAdmin } from '../../auth/middleware.js';
import {
  createAlertRuleRequestSchema,
  updateAlertRuleRequestSchema,
  createNotifyChannelRequestSchema,
  updateNotifyChannelRequestSchema,
  telegramConfigSchema,
  discordConfigSchema,
  slackConfigSchema,
  genericWebhookConfigSchema,
} from '@nodepulse/protocol';
import { randomBytes, toBase64Url } from '../../auth/crypto.js';
import {
  encryptChannelConfig,
  decryptChannelConfig,
  maskChannelConfig,
} from '../../auth/aes-gcm.js';


export const adminAlertsRouter = new Hono<{ Bindings: Env }>();

adminAlertsRouter.use('*', requireAdmin);

function generateId(prefix = 'rule_'): string {
  const bytes = randomBytes(8);
  return `${prefix}${toBase64Url(bytes).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)}`;
}

// GET /api/admin/alerts/rules
adminAlertsRouter.get('/rules', async (c) => {
  const rules = await db.listAlertRules(c.env.DB);
  const items = rules.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled === 1,
    metric: r.metric,
    op: r.op,
    threshold: r.threshold,
    duration_s: r.duration_s,
    server_filter: JSON.parse(r.server_filter || '{}'),
    channels: JSON.parse(r.channels || '[]'),
    severity: r.severity,
    cooldown_s: r.cooldown_s,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return c.json({
    ok: true,
    data: items,
  });
});

// POST /api/admin/alerts/rules
adminAlertsRouter.post('/rules', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createAlertRuleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid alert rule input',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const id = generateId('rule_');
  const d = parsed.data;

  const record: db.AlertRuleRecord = {
    id,
    name: d.name,
    enabled: d.enabled === false ? 0 : 1,
    metric: d.metric,
    op: d.op,
    threshold: d.threshold,
    duration_s: d.duration_s ?? 300,
    server_filter: JSON.stringify(d.server_filter ?? { all: true }),
    channels: JSON.stringify(d.channels ?? []),
    severity: d.severity ?? 'warning',
    cooldown_s: d.cooldown_s ?? 1800,
    created_at: now,
    updated_at: now,
  };

  await db.insertAlertRule(c.env.DB, record);

  // Sync config with Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  await hubStub.syncConfig({ type: 'rules_changed' }).catch(() => {});

  return c.json(
    {
      ok: true,
      data: {
        id: record.id,
        name: record.name,
        enabled: record.enabled === 1,
        metric: record.metric,
        op: record.op,
        threshold: record.threshold,
        duration_s: record.duration_s,
        server_filter: d.server_filter ?? { all: true },
        channels: d.channels ?? [],
        severity: record.severity,
        cooldown_s: record.cooldown_s,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
    },
    201
  );
});

// PUT /api/admin/alerts/rules/:id
adminAlertsRouter.put('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findAlertRuleById(c.env.DB, id);
  if (!existing) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Alert rule not found' },
      },
      404
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateAlertRuleRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid alert rule input',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const d = parsed.data;

  const updateFields: Partial<Omit<db.AlertRuleRecord, 'id' | 'created_at'>> = {
    updated_at: now,
  };

  if (d.name !== undefined) updateFields.name = d.name;
  if (d.enabled !== undefined) updateFields.enabled = d.enabled ? 1 : 0;
  if (d.metric !== undefined) updateFields.metric = d.metric;
  if (d.op !== undefined) updateFields.op = d.op;
  if (d.threshold !== undefined) updateFields.threshold = d.threshold;
  if (d.duration_s !== undefined) updateFields.duration_s = d.duration_s;
  if (d.server_filter !== undefined)
    updateFields.server_filter = JSON.stringify(d.server_filter);
  if (d.channels !== undefined)
    updateFields.channels = JSON.stringify(d.channels);
  if (d.severity !== undefined) updateFields.severity = d.severity;
  if (d.cooldown_s !== undefined) updateFields.cooldown_s = d.cooldown_s;

  await db.updateAlertRule(c.env.DB, id, updateFields);

  // Sync config with Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  await hubStub.syncConfig({ type: 'rules_changed' }).catch(() => {});

  const updated = await db.findAlertRuleById(c.env.DB, id);
  return c.json({
    ok: true,
    data: {
      id: updated!.id,
      name: updated!.name,
      enabled: updated!.enabled === 1,
      metric: updated!.metric,
      op: updated!.op,
      threshold: updated!.threshold,
      duration_s: updated!.duration_s,
      server_filter: JSON.parse(updated!.server_filter || '{}'),
      channels: JSON.parse(updated!.channels || '[]'),
      severity: updated!.severity,
      cooldown_s: updated!.cooldown_s,
      created_at: updated!.created_at,
      updated_at: updated!.updated_at,
    },
  });
});

// DELETE /api/admin/alerts/rules/:id
adminAlertsRouter.delete('/rules/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findAlertRuleById(c.env.DB, id);
  if (!existing) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Alert rule not found' },
      },
      404
    );
  }

  await db.deleteAlertRule(c.env.DB, id);

  // Sync config with Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  await hubStub.syncConfig({ type: 'rules_changed' }).catch(() => {});

  return c.json({ ok: true, data: { deleted: true } });
});

// GET /api/admin/alerts/events
adminAlertsRouter.get('/events', async (c) => {
  const events = await db.listRecentAlertEvents(c.env.DB, 100);
  return c.json({
    ok: true,
    data: events,
  });
});

// --- Notify Channels ---

// GET /api/admin/alerts/channels
adminAlertsRouter.get('/channels', async (c) => {
  const channels = await db.listNotifyChannels(c.env.DB);
  const masterKey = c.env.MASTER_KEY || c.env.TOKEN_PEPPER || 'local_master_key_32_bytes_fallback';

  const items = [];
  for (const ch of channels) {
    let maskedConfig: Record<string, string> = {};
    try {
      const rawEnc = ch.config_enc instanceof Uint8Array ? ch.config_enc : new Uint8Array(ch.config_enc);
      const decrypted = await decryptChannelConfig(ch.id, rawEnc, masterKey);
      maskedConfig = maskChannelConfig(ch.type, decrypted);
    } catch {
      maskedConfig = { status: 'decryption_failed' };
    }

    items.push({
      id: ch.id,
      type: ch.type,
      name: ch.name,
      enabled: ch.enabled === 1,
      config: maskedConfig,
      created_at: ch.created_at,
    });
  }

  return c.json({
    ok: true,
    data: items,
  });
});

// POST /api/admin/alerts/channels
adminAlertsRouter.post('/channels', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createNotifyChannelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid channel input',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const { type, name, enabled, config: rawConfig } = parsed.data;

  // Validate type-specific config schema
  if (type === 'telegram') {
    const p = telegramConfigSchema.safeParse(rawConfig);
    if (!p.success) {
      return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid telegram config', details: p.error.flatten() } }, 400);
    }
  } else if (type === 'discord') {
    const p = discordConfigSchema.safeParse(rawConfig);
    if (!p.success) {
      return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid discord config', details: p.error.flatten() } }, 400);
    }
  } else if (type === 'slack') {
    const p = slackConfigSchema.safeParse(rawConfig);
    if (!p.success) {
      return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid slack config', details: p.error.flatten() } }, 400);
    }
  } else if (type === 'webhook') {
    const p = genericWebhookConfigSchema.safeParse(rawConfig);
    if (!p.success) {
      return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid webhook config', details: p.error.flatten() } }, 400);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const id = generateId('chan_');
  const masterKey = c.env.MASTER_KEY || c.env.TOKEN_PEPPER || 'local_master_key_32_bytes_fallback';

  const encryptedConfig = await encryptChannelConfig(id, rawConfig, masterKey);

  const record: db.NotifyChannelRecord = {
    id,
    type,
    name,
    config_enc: encryptedConfig,
    enabled: enabled === false ? 0 : 1,
    created_at: now,
  };

  await db.insertNotifyChannel(c.env.DB, record);

  // Sync config with Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  await hubStub.syncConfig({ type: 'channels_changed' }).catch(() => {});

  const masked = maskChannelConfig(type, rawConfig);
  return c.json(
    {
      ok: true,
      data: {
        id: record.id,
        type: record.type,
        name: record.name,
        enabled: record.enabled === 1,
        config: masked,
        created_at: record.created_at,
      },
    },
    201
  );
});

// PUT /api/admin/alerts/channels/:id
adminAlertsRouter.put('/channels/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findNotifyChannelById(c.env.DB, id);
  if (!existing) {
    return c.json(
      { ok: false, error: { code: 'not_found', message: 'Notify channel not found' } },
      404
    );
  }

  const body = await c.req.json().catch(() => null);
  const parsed = updateNotifyChannelRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid update input',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const { name, enabled, config: rawConfig } = parsed.data;
  const masterKey = c.env.MASTER_KEY || c.env.TOKEN_PEPPER || 'local_master_key_32_bytes_fallback';

  const updateFields: Partial<Omit<db.NotifyChannelRecord, 'id' | 'created_at'>> = {};
  if (name !== undefined) updateFields.name = name;
  if (enabled !== undefined) updateFields.enabled = enabled ? 1 : 0;

  if (rawConfig !== undefined) {
    // Validate type-specific config schema
    if (existing.type === 'telegram') {
      const p = telegramConfigSchema.safeParse(rawConfig);
      if (!p.success) {
        return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid telegram config', details: p.error.flatten() } }, 400);
      }
    } else if (existing.type === 'discord') {
      const p = discordConfigSchema.safeParse(rawConfig);
      if (!p.success) {
        return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid discord config', details: p.error.flatten() } }, 400);
      }
    } else if (existing.type === 'slack') {
      const p = slackConfigSchema.safeParse(rawConfig);
      if (!p.success) {
        return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid slack config', details: p.error.flatten() } }, 400);
      }
    } else if (existing.type === 'webhook') {
      const p = genericWebhookConfigSchema.safeParse(rawConfig);
      if (!p.success) {
        return c.json({ ok: false, error: { code: 'validation_failed', message: 'Invalid webhook config', details: p.error.flatten() } }, 400);
      }
    }
    updateFields.config_enc = await encryptChannelConfig(id, rawConfig, masterKey);
  }

  await db.updateNotifyChannel(c.env.DB, id, updateFields);

  // Sync config with Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  await hubStub.syncConfig({ type: 'channels_changed' }).catch(() => {});

  const updated = await db.findNotifyChannelById(c.env.DB, id);
  let maskedConfig: Record<string, string> = {};
  try {
    const rawEnc = updated!.config_enc instanceof Uint8Array ? updated!.config_enc : new Uint8Array(updated!.config_enc);
    const decrypted = await decryptChannelConfig(id, rawEnc, masterKey);
    maskedConfig = maskChannelConfig(updated!.type, decrypted);
  } catch {
    maskedConfig = { status: 'decryption_failed' };
  }

  return c.json({
    ok: true,
    data: {
      id: updated!.id,
      type: updated!.type,
      name: updated!.name,
      enabled: updated!.enabled === 1,
      config: maskedConfig,
      created_at: updated!.created_at,
    },
  });
});

// DELETE /api/admin/alerts/channels/:id
adminAlertsRouter.delete('/channels/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.findNotifyChannelById(c.env.DB, id);
  if (!existing) {
    return c.json(
      { ok: false, error: { code: 'not_found', message: 'Notify channel not found' } },
      404
    );
  }

  await db.deleteNotifyChannel(c.env.DB, id);

  // Sync config with Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  await hubStub.syncConfig({ type: 'channels_changed' }).catch(() => {});

  return c.json({ ok: true, data: { deleted: true } });
});

