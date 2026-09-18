import { z } from 'zod';
import {
  percentageSchema,
  safeIntSchema,
  safeString,
  unixTimestampSchema,
} from './common.js';

export const hostInfoSchema = z
  .object({
    hostname: safeString(128),
    os: safeString(64),
    platform: safeString(64),
    platform_ver: safeString(64),
    kernel: safeString(128),
    arch: safeString(32),
    virt: safeString(32),
    cpu_model: safeString(128),
    cpu_cores: z.number().int().min(1).max(4096),
    mem_total: safeIntSchema,
    swap_total: safeIntSchema,
    disk_total: safeIntSchema,
    boot_ts: unixTimestampSchema,
  })
  .strict();

export type HostInfo = z.infer<typeof hostInfoSchema>;

export const ipInfoSchema = z
  .object({
    v4: safeString(64).nullable(),
    v6: safeString(64).nullable(),
  })
  .strict();

export type IpInfo = z.infer<typeof ipInfoSchema>;

export const agentHelloSchema = z
  .object({
    t: z.literal('hello'),
    v: z.literal(1),
    agent: safeString(32),
    host: hostInfoSchema,
    ip: ipInfoSchema.optional(),
  })
  .strict();

export type AgentHello = z.infer<typeof agentHelloSchema>;

export const bucketMetricPairSchema = z.array(z.number()).min(1).max(2);

export const bucketSchema = z
  .object({
    ts: unixTimestampSchema,
    cpu: bucketMetricPairSchema,
    mem: bucketMetricPairSchema,
    swp: bucketMetricPairSchema,
    dsk: bucketMetricPairSchema,
    ld1: bucketMetricPairSchema,
    nin: bucketMetricPairSchema,
    nout: bucketMetricPairSchema,
    rxb: safeIntSchema,
    txb: safeIntSchema,
    tcp: bucketMetricPairSchema,
    udp: bucketMetricPairSchema,
    pr: bucketMetricPairSchema,
    n: z.number().int().min(1).max(120),
  })
  .strict();

export type Bucket = z.infer<typeof bucketSchema>;

export const diskSampleSchema = z
  .object({
    m: safeString(64),
    u: safeIntSchema,
    t: safeIntSchema,
  })
  .strict();

export type DiskSample = z.infer<typeof diskSampleSchema>;

export const netSampleSchema = z
  .object({
    rx: safeIntSchema,
    tx: safeIntSchema,
    rxs: z.number().min(0),
    txs: z.number().min(0),
  })
  .strict();

export type NetSample = z.infer<typeof netSampleSchema>;

export const connSampleSchema = z
  .object({
    tcp: safeIntSchema,
    udp: safeIntSchema,
  })
  .strict();

export type ConnSample = z.infer<typeof connSampleSchema>;

export const agentSampleSchema = z
  .object({
    t: z.literal('s'),
    ts: unixTimestampSchema,
    cpu: percentageSchema,
    ld: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
    mem: z.object({ u: safeIntSchema, t: safeIntSchema }).strict(),
    swp: z.object({ u: safeIntSchema, t: safeIntSchema }).strict(),
    dsk: z.array(diskSampleSchema).max(16),
    net: netSampleSchema,
    cn: connSampleSchema,
    pr: safeIntSchema,
    up: z.number().min(0),
    tmp: z.number().min(-50).max(200).optional().nullable(),
    b: bucketSchema.optional(),
  })
  .strict();

export type AgentSample = z.infer<typeof agentSampleSchema>;

export const sampleWithoutBucketSchema = agentSampleSchema.omit({ b: true });
export type SampleWithoutBucket = z.infer<typeof sampleWithoutBucketSchema>;

export const agentPingSchema = z
  .object({
    t: z.literal('ping'),
  })
  .strict();

export type AgentPing = z.infer<typeof agentPingSchema>;

export const agentMessageSchema = z.discriminatedUnion('t', [
  agentHelloSchema,
  agentSampleSchema,
  agentPingSchema,
]);

export type AgentMessage = z.infer<typeof agentMessageSchema>;
