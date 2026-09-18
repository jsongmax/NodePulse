import { z } from 'zod';
import { safeString, unixTimestampSchema } from './common.js';

// Re-export base schemas
export * from './common.js';
export * from './agent.js';
export * from './viewer.js';
export * from './hub.js';

// --- Alert Rule Schemas ---

export const alertMetricSchema = z.enum([
  'cpu',
  'mem',
  'swap',
  'disk',
  'load1',
  'net_in',
  'net_out',
  'offline',
  'traffic_cycle',
]);

export const alertOperatorSchema = z.enum(['>', '>=', '<', '<=']);
export const alertSeveritySchema = z.enum(['warning', 'critical']);

export const serverFilterSchema = z
  .object({
    all: z.boolean().optional(),
    groups: z.array(safeString(32)).optional(),
    servers: z.array(safeString(32)).optional(),
  })
  .strict();

export const alertRuleSchema = z
  .object({
    id: safeString(32),
    name: safeString(64),
    enabled: z.boolean().default(true),
    metric: alertMetricSchema,
    op: alertOperatorSchema,
    threshold: z.number(),
    duration_s: z.number().int().min(0).max(86400).default(300),
    server_filter: serverFilterSchema.default({ all: true }),
    channels: z.array(safeString(32)).default([]),
    severity: alertSeveritySchema.default('warning'),
    cooldown_s: z.number().int().min(60).max(86400).default(1800),
    created_at: unixTimestampSchema,
    updated_at: unixTimestampSchema,
  })
  .strict();

export type AlertRule = z.infer<typeof alertRuleSchema>;

export const createAlertRuleRequestSchema = z
  .object({
    name: safeString(64),
    enabled: z.boolean().optional(),
    metric: alertMetricSchema,
    op: alertOperatorSchema,
    threshold: z.number(),
    duration_s: z.number().int().min(0).max(86400).optional(),
    server_filter: serverFilterSchema.optional(),
    channels: z.array(safeString(32)).optional(),
    severity: alertSeveritySchema.optional(),
    cooldown_s: z.number().int().min(60).max(86400).optional(),
  })
  .strict();

export type CreateAlertRuleRequest = z.infer<typeof createAlertRuleRequestSchema>;

export const updateAlertRuleRequestSchema = createAlertRuleRequestSchema
  .partial()
  .strict();

export type UpdateAlertRuleRequest = z.infer<typeof updateAlertRuleRequestSchema>;

// --- Notification Channel Schemas ---

export const notifyChannelTypeSchema = z.enum([
  'telegram',
  'discord',
  'slack',
  'webhook',
]);

export const notifyChannelSchema = z
  .object({
    id: safeString(32),
    type: notifyChannelTypeSchema,
    name: safeString(64),
    enabled: z.boolean().default(true),
    config: z.record(z.string()).default({}), // masked representation
    created_at: unixTimestampSchema,
  })
  .strict();

export type NotifyChannel = z.infer<typeof notifyChannelSchema>;

export const telegramConfigSchema = z
  .object({
    bot_token: safeString(128),
    chat_id: z.union([safeString(64), z.number()]),
  })
  .strict();

export const webhookUrlSchema = z.string().url().refine((val) => {
  try {
    const u = new URL(val);
    if (u.protocol !== 'https:') return false;
    if (u.port && u.port !== '443') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.internal') ||
      host.endsWith('.local') ||
      host.endsWith('.arpa')
    ) {
      return false;
    }
    // Check IP literals
    const isIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
    if (isIpv4) return false;
    if (host.startsWith('[') && host.endsWith(']')) return false; // IPv6
    if (host.includes(':')) return false;
    return true;
  } catch {
    return false;
  }
}, {
  message:
    'Webhook URL must use https://, port 443 only, and cannot use localhost, IP literals, or .internal/.local domains (SSRF protection).',
});

export const discordConfigSchema = z
  .object({
    webhook_url: webhookUrlSchema,
  })
  .strict();

export const slackConfigSchema = z
  .object({
    webhook_url: webhookUrlSchema,
  })
  .strict();

export const genericWebhookConfigSchema = z
  .object({
    url: webhookUrlSchema,
    secret: safeString(128).optional(),
    i_understand_risks: z.boolean().optional(),
  })
  .strict();

export const createNotifyChannelRequestSchema = z
  .object({
    type: notifyChannelTypeSchema,
    name: safeString(64),
    enabled: z.boolean().optional(),
    config: z.record(z.unknown()),
  })
  .strict();

export type CreateNotifyChannelRequest = z.infer<
  typeof createNotifyChannelRequestSchema
>;

export const updateNotifyChannelRequestSchema = z
  .object({
    name: safeString(64).optional(),
    enabled: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .strict();

export type UpdateNotifyChannelRequest = z.infer<
  typeof updateNotifyChannelRequestSchema
>;

export * from './api.js';
