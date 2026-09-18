import { z } from 'zod';
import { hostInfoSchema, sampleWithoutBucketSchema } from './agent.js';
import { safeString, unixTimestampSchema } from './common.js';

// RingPoint: [ts, cpu_a, cpu_m, mem_a, mem_m, swap_a, disk_a, load1_a, load1_m, nin_a, nin_m, nout_a, nout_m, rxb, txb, tcp_a, udp_a, proc_a]
export const ringPointSchema = z.tuple([
  z.number(), // ts
  z.number(), // cpu_a
  z.number(), // cpu_m
  z.number(), // mem_a
  z.number(), // mem_m
  z.number(), // swap_a
  z.number(), // disk_a
  z.number(), // load1_a
  z.number(), // load1_m
  z.number(), // nin_a
  z.number(), // nin_m
  z.number(), // nout_a
  z.number(), // nout_m
  z.number(), // rxb
  z.number(), // txb
  z.number(), // tcp_a
  z.number(), // udp_a
  z.number(), // proc_a
]);

export type RingPoint = z.infer<typeof ringPointSchema>;

export const viewerServerStateSchema = z
  .object({
    id: safeString(64),
    online: z.boolean(),
    last: sampleWithoutBucketSchema.nullable(),
    last_ts: unixTimestampSchema,
  })
  .strict();

export type ViewerServerState = z.infer<typeof viewerServerStateSchema>;

export const viewerSnapshotSchema = z
  .object({
    t: z.literal('snapshot'),
    now: unixTimestampSchema,
    servers: z.array(viewerServerStateSchema),
  })
  .strict();

export type ViewerSnapshot = z.infer<typeof viewerSnapshotSchema>;

export const viewerDeltaSchema = z
  .object({
    t: z.literal('delta'),
    id: safeString(64),
    ts: unixTimestampSchema,
    s: sampleWithoutBucketSchema,
  })
  .strict();

export type ViewerDelta = z.infer<typeof viewerDeltaSchema>;

export const viewerBucketSchema = z
  .object({
    t: z.literal('bucket'),
    id: safeString(64),
    p: ringPointSchema,
  })
  .strict();

export type ViewerBucket = z.infer<typeof viewerBucketSchema>;

export const viewerServerOnlineSchema = z
  .object({
    t: z.literal('server.online'),
    id: safeString(64),
    ts: unixTimestampSchema,
    static: hostInfoSchema.optional(),
  })
  .strict();

export type ViewerServerOnline = z.infer<typeof viewerServerOnlineSchema>;

export const viewerServerOfflineSchema = z
  .object({
    t: z.literal('server.offline'),
    id: safeString(64),
    ts: unixTimestampSchema,
    last: sampleWithoutBucketSchema.nullable().optional(),
  })
  .strict();

export type ViewerServerOffline = z.infer<typeof viewerServerOfflineSchema>;

export const alertEventSchema = z
  .object({
    id: safeString(64),
    rule_id: safeString(64),
    rule_name: safeString(128),
    server_id: safeString(64),
    severity: z.enum(['warning', 'critical']),
    state: z.enum(['firing', 'resolved']),
    value: z.number(),
    ts: unixTimestampSchema,
  })
  .strict();

export type AlertEvent = z.infer<typeof alertEventSchema>;

export const viewerAlertSchema = z
  .object({
    t: z.literal('alert'),
    event: alertEventSchema,
  })
  .strict();

export type ViewerAlert = z.infer<typeof viewerAlertSchema>;

export const viewerPingSchema = z
  .object({
    t: z.literal('ping'),
  })
  .strict();

export type ViewerPing = z.infer<typeof viewerPingSchema>;

export const viewerPongSchema = z
  .object({
    t: z.literal('pong'),
  })
  .strict();

export type ViewerPong = z.infer<typeof viewerPongSchema>;

export const hubToViewerMessageSchema = z.discriminatedUnion('t', [
  viewerSnapshotSchema,
  viewerDeltaSchema,
  viewerBucketSchema,
  viewerServerOnlineSchema,
  viewerServerOfflineSchema,
  viewerAlertSchema,
  viewerPongSchema,
]);

export type HubToViewerMessage = z.infer<typeof hubToViewerMessageSchema>;

export const viewerToHubMessageSchema = z.discriminatedUnion('t', [
  viewerPingSchema,
]);

export type ViewerToHubMessage = z.infer<typeof viewerToHubMessageSchema>;
