import { z } from 'zod';
import { safeString, unixTimestampSchema } from './common.js';

export const siteConfigSchema = z
  .object({
    name: safeString(64),
    public_mode: z.boolean(),
    locale: safeString(16),
    timezone: safeString(64),
    wall: z
      .object({
        scene: safeString(32).default('map'),
        carousel_interval: z.number().int().min(5).max(3600).default(60),
        show_fields: z.array(safeString(32)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SiteConfig = z.infer<typeof siteConfigSchema>;

export const setupStatusSchema = z
  .object({
    setup_done: z.boolean(),
  })
  .strict();

export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const setupVerifyRequestSchema = z
  .object({
    token: safeString(128),
  })
  .strict();

export type SetupVerifyRequest = z.infer<typeof setupVerifyRequestSchema>;

export const authMeSchema = z
  .object({
    kind: z.enum(['admin', 'view']),
    scope: z.unknown().optional(),
    display_name: safeString(64).optional(),
    expires_at: unixTimestampSchema.optional(),
  })
  .strict();

export type AuthMe = z.infer<typeof authMeSchema>;

export const serverMetaSchema = z
  .object({
    id: safeString(32),
    name: safeString(128),
    group_id: safeString(32).nullable().optional(),
    token_prefix: safeString(16).optional(),
    note: safeString(256).nullable().optional(),
    sort_order: z.number().int().default(0),
    public: z.boolean().default(false),
    geo_lat: z.number().nullable().optional(),
    geo_lng: z.number().nullable().optional(),
    geo_label: safeString(64).nullable().optional(),
    country: safeString(32).nullable().optional(),
    traffic_quota_bytes: z.number().nullable().optional(),
    traffic_reset_day: z.number().int().min(1).max(31).nullable().optional(),
    traffic_direction: z.enum(['in', 'out', 'both']).nullable().optional(),
    interval_s: z.number().int().min(1).max(300).default(10),
    created_at: unixTimestampSchema,
    updated_at: unixTimestampSchema,
  })
  .strict();

export type ServerMeta = z.infer<typeof serverMetaSchema>;

export const createServerRequestSchema = z
  .object({
    name: safeString(128),
    group_id: safeString(32).optional(),
    note: safeString(256).optional(),
    sort_order: z.number().int().optional(),
    public: z.boolean().optional(),
    geo_lat: z.number().optional(),
    geo_lng: z.number().optional(),
    geo_label: safeString(64).optional(),
    country: safeString(32).optional(),
    traffic_quota_bytes: z.number().optional(),
    traffic_reset_day: z.number().int().min(1).max(31).optional(),
    traffic_direction: z.enum(['in', 'out', 'both']).optional(),
    interval_s: z.number().int().min(1).max(300).optional(),
  })
  .strict();

export type CreateServerRequest = z.infer<typeof createServerRequestSchema>;

export const updateServerRequestSchema = createServerRequestSchema
  .partial()
  .strict();

export type UpdateServerRequest = z.infer<typeof updateServerRequestSchema>;

export const groupSchema = z
  .object({
    id: safeString(32),
    name: safeString(64),
    sort_order: z.number().int().default(0),
  })
  .strict();

export type Group = z.infer<typeof groupSchema>;

export const createGroupRequestSchema = z
  .object({
    name: safeString(64),
    sort_order: z.number().int().optional(),
  })
  .strict();

export type CreateGroupRequest = z.infer<typeof createGroupRequestSchema>;

export const paginationQuerySchema = z
  .object({
    cursor: safeString(128).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
