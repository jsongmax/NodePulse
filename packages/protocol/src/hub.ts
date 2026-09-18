import { z } from 'zod';
import { safeString } from './common.js';

export const hubWelcomeSchema = z
  .object({
    t: z.literal('welcome'),
    server_id: safeString(64),
    name: safeString(128),
    interval: z.number().int().min(1).max(300),
    bucket_minutes: z.number().int().min(1).max(10),
    now_ms: z.number().int().min(0),
    max_bytes: z.number().int().min(1024).max(65536),
  })
  .strict();

export type HubWelcome = z.infer<typeof hubWelcomeSchema>;

export const hubConfigSchema = z
  .object({
    t: z.literal('config'),
    interval: z.number().int().min(1).max(300).optional(),
    bucket_minutes: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export type HubConfig = z.infer<typeof hubConfigSchema>;

export const hubByeSchema = z
  .object({
    t: z.literal('bye'),
    reason: safeString(128),
  })
  .strict();

export type HubBye = z.infer<typeof hubByeSchema>;

export const hubPongSchema = z
  .object({
    t: z.literal('pong'),
  })
  .strict();

export type HubPong = z.infer<typeof hubPongSchema>;

export const hubToAgentMessageSchema = z.discriminatedUnion('t', [
  hubWelcomeSchema,
  hubConfigSchema,
  hubByeSchema,
  hubPongSchema,
]);

export type HubToAgentMessage = z.infer<typeof hubToAgentMessageSchema>;
