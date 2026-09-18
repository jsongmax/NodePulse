/* eslint-disable no-control-regex */
import { z } from 'zod';

// Reject control characters (0x00-0x1F, 0x7F) and Unicode Bidi override characters (U+202A-U+202E, U+2066-U+2069)
export const SAFE_STRING_REGEX =
  /^[^\x00-\x1F\x7F\u202A-\u202E\u2066-\u2069]*$/;

export function safeString(max = 128) {
  return z
    .string()
    .max(max)
    .regex(
      SAFE_STRING_REGEX,
      'String contains forbidden control or bidi characters'
    );
}

export const percentageSchema = z.number().min(0).max(100);
export const safeIntSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const unixTimestampSchema = z.number().int().min(0);

export const apiErrorSchema = z
  .object({
    code: safeString(64),
    message: safeString(256),
    details: z.unknown().optional(),
  })
  .strict();

export function apiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({
      ok: z.literal(true),
      data: dataSchema,
    })
    .strict();
}

export function apiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z
      .object({
        ok: z.literal(true),
        data: dataSchema,
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        error: apiErrorSchema,
      })
      .strict(),
  ]);
}
