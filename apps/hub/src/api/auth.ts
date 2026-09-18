import { Hono } from 'hono';
import { z } from 'zod';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import {
  fromBase64Url,
  hashIp,
  randomTokenHex,
  sha256Hex,
} from '../auth/crypto.js';
import {
  buildClearCookieHeader,
  buildCookieHeader,
  SESSION_COOKIE_NAME,
  VIEW_COOKIE_NAME,
} from '../auth/cookies.js';
import { requireView } from '../auth/middleware.js';

export const passkeyAssertionSchema = z
  .object({
    id: z.string().min(1),
    rawId: z.string().optional(),
    response: z.object({
      clientDataJSON: z.string().min(1),
      authenticatorData: z.string().min(1),
      signature: z.string().min(1),
      userHandle: z.string().optional().nullable(),
    }),
    type: z.string().optional(),
  })
  .passthrough();

export function extractChallengeFromClientData(
  clientDataJSONBase64?: string
): string | null {
  if (!clientDataJSONBase64 || typeof clientDataJSONBase64 !== 'string')
    return null;
  try {
    const rawBytes = fromBase64Url(clientDataJSONBase64);
    const jsonStr = new TextDecoder().decode(rawBytes);
    const parsed = JSON.parse(jsonStr) as { challenge?: unknown };
    return typeof parsed.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}

export const authRouter = new Hono<{ Bindings: Env }>();

// POST /api/auth/passkey/options
authRouter.post('/passkey/options', async (c) => {
  const url = new URL(c.env.APP_ORIGIN);
  const rpID = url.hostname;

  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'required',
    allowCredentials: [], // Allow discoverable credentials
  });

  const now = Math.floor(Date.now() / 1000);
  const challengeBytes = new TextEncoder().encode(options.challenge);
  await db.saveChallenge(
    c.env.DB,
    `auth:${options.challenge}`,
    challengeBytes,
    'authentication',
    now + 60
  );

  return c.json({
    ok: true,
    data: options,
  });
});

// POST /api/auth/passkey/verify
authRouter.post('/passkey/verify', async (c) => {
  const rawBody = await c.req.json().catch(() => null);
  const parsed = passkeyAssertionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid passkey assertion payload',
          details: parsed.error.flatten(),
        },
      },
      400
    );
  }

  const body = parsed.data as unknown as AuthenticationResponseJSON;
  const challengeStr = extractChallengeFromClientData(
    body.response?.clientDataJSON
  );
  if (!challengeStr) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Malformed clientDataJSON in assertion',
        },
      },
      400
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const clientIp =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    '127.0.0.1';
  const ipHash = await hashIp(clientIp, c.env.TOKEN_PEPPER || 'pepper');

  // 1. Consume challenge first (SEC-M1-03: prevent credential enumeration without valid challenge)
  const challengeBytes = await db.consumeChallenge(
    c.env.DB,
    `auth:${challengeStr}`,
    'authentication',
    now
  );

  // 2. Parse credential ID and look up passkey
  let credentialIdBytes: Uint8Array | null = null;
  try {
    credentialIdBytes = fromBase64Url(body.id);
  } catch {
    credentialIdBytes = null;
  }

  const passkey = credentialIdBytes
    ? await db.findPasskeyByCredentialId(c.env.DB, credentialIdBytes)
    : null;

  // Unified error response to prevent oracle enumeration
  if (!challengeBytes || !passkey) {
    await db.recordAudit(c.env.DB, {
      ts: now,
      user_id: passkey?.user_id ?? null,
      action: 'login_failed',
      target: body.id.slice(0, 16),
      details: !challengeBytes
        ? 'Challenge expired or invalid'
        : 'Passkey not recognized',
      ip_hash: ipHash,
    });
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Invalid or expired authentication credentials',
        },
      },
      401
    );
  }

  const expectedChallenge = new TextDecoder().decode(challengeBytes);
  const url = new URL(c.env.APP_ORIGIN);
  const rpID = url.hostname;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: c.env.APP_ORIGIN,
      expectedRPID: rpID,
      credential: {
        id: body.id,
        publicKey:
          passkey.public_key instanceof Uint8Array
            ? passkey.public_key
            : new Uint8Array(passkey.public_key),
        counter: passkey.counter,
        transports: passkey.transports
          ? JSON.parse(passkey.transports)
          : undefined,
      },
      requireUserVerification: true,
    });
  } catch (err: unknown) {
    await db.recordAudit(c.env.DB, {
      ts: now,
      user_id: passkey.user_id,
      action: 'login_failed',
      target: passkey.id,
      details: err instanceof Error ? err.message : 'Verification error',
      ip_hash: ipHash,
    });
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message:
            err instanceof Error ? err.message : 'Passkey verification failed',
        },
      },
      401
    );
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Passkey verification failed',
        },
      },
      401
    );
  }

  const { newCounter } = verification.authenticationInfo;

  // Clone detection per SECURITY §4.1
  if (newCounter <= passkey.counter && passkey.counter > 0) {
    await db.recordAudit(c.env.DB, {
      ts: now,
      user_id: passkey.user_id,
      action: 'passkey_clone_detected',
      target: passkey.id,
      details: `Reported counter ${newCounter} <= stored counter ${passkey.counter}`,
      ip_hash: ipHash,
    });
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Possible cloned authenticator detected',
        },
      },
      401
    );
  }

  // Update passkey counter
  await db.updatePasskeyCounter(c.env.DB, passkey.id, newCounter, now);

  // Record audit
  await db.recordAudit(c.env.DB, {
    ts: now,
    user_id: passkey.user_id,
    action: 'login_success',
    target: passkey.id,
    details: `Login via passkey ${passkey.name ?? passkey.id}`,
    ip_hash: ipHash,
  });

  // Issue session
  const sessionId = randomTokenHex(32);
  const sessionHash = await sha256Hex(sessionId);
  await db.createSession(c.env.DB, {
    id_hash: sessionHash,
    user_id: passkey.user_id,
    created_at: now,
    expires_at: now + 7 * 86400, // 7 days absolute
    last_seen_at: now,
    ip_hash: ipHash,
    ua: c.req.header('User-Agent')?.slice(0, 200) ?? null,
  });

  c.header(
    'Set-Cookie',
    buildCookieHeader(SESSION_COOKIE_NAME, sessionId, {
      maxAge: 7 * 86400,
      sameSite: 'Strict',
      path: '/',
    })
  );

  return c.json({
    ok: true,
    data: { success: true },
  });
});

// GET /api/auth/me
authRouter.get('/me', requireView, async (c) => {
  const auth = c.get('auth');
  if (!auth) {
    return c.json(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Not authenticated' },
      },
      401
    );
  }

  return c.json({
    ok: true,
    data: {
      kind: auth.kind,
      scope: auth.scope ?? null,
      display_name: auth.user?.display_name ?? null,
      expires_at: auth.expiresAt ?? null,
    },
  });
});

// POST /api/auth/logout
authRouter.post('/logout', requireView, async (c) => {
  const auth = c.get('auth');
  if (auth?.kind === 'admin' && auth.sessionIdHash) {
    await db.deleteSession(c.env.DB, auth.sessionIdHash);
    c.header(
      'Set-Cookie',
      buildClearCookieHeader(SESSION_COOKIE_NAME, { path: '/' })
    );
  } else {
    c.header(
      'Set-Cookie',
      buildClearCookieHeader(VIEW_COOKIE_NAME, { path: '/' })
    );
  }

  return c.json({
    ok: true,
    data: { logged_out: true },
  });
});
