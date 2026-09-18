import { Hono } from 'hono';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoUint8Array } from '@simplewebauthn/server/helpers';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import {
  constantTimeEqual,
  fromBase64Url,
  randomTokenHex,
  sha256,
  sha256Hex,
} from '../auth/crypto.js';
import {
  buildClearCookieHeader,
  buildCookieHeader,
  getCookie,
  SETUP_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '../auth/cookies.js';

export const setupRouter = new Hono<{ Bindings: Env }>();

// GET /api/setup/status
setupRouter.get('/status', async (c) => {
  let setupDone = false;
  try {
    setupDone = (await db.getSetting(c.env.DB, 'setup_done')) === '1';
  } catch {
    setupDone = false;
  }
  return c.json({
    ok: true,
    data: {
      setup_done: setupDone,
    },
  });
});

// Guard middleware: all setup routes below return 404 if setup_done is 1
setupRouter.use('*', async (c, next) => {
  let setupDone = false;
  try {
    setupDone = (await db.getSetting(c.env.DB, 'setup_done')) === '1';
  } catch {
    setupDone = false;
  }
  if (setupDone) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'not_found',
          message: 'Setup is already completed',
        },
      },
      404
    );
  }
  await next();
});

// POST /api/setup/verify
setupRouter.post('/verify', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { token?: string };
  const token = body.token;
  const configuredSetupToken = c.env.SETUP_TOKEN;

  if (!token || !configuredSetupToken) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Invalid setup token',
        },
      },
      401
    );
  }

  // Constant-time SHA-256 comparison
  const inputHash = await sha256(token);
  const targetHash = await sha256(configuredSetupToken);

  if (!constantTimeEqual(inputHash, targetHash)) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Invalid setup token',
        },
      },
      401
    );
  }

  // Generate 10-minute setup session token
  const setupSessionId = randomTokenHex(32);
  const setupSessionHash = await sha256Hex(setupSessionId);
  const now = Math.floor(Date.now() / 1000);
  await db.setSetting(
    c.env.DB,
    'temp_setup_session',
    JSON.stringify({ hash: setupSessionHash, expires_at: now + 600 })
  );

  const cookieHeader = buildCookieHeader(SETUP_COOKIE_NAME, setupSessionId, {
    maxAge: 600,
    sameSite: 'Strict',
    path: '/',
  });
  c.header('Set-Cookie', cookieHeader);

  return c.json({
    ok: true,
    data: { verified: true },
  });
});

// Helper to check valid __Host-np_setup cookie
async function requireSetupCookie(
  dbInstance: D1Database,
  cookieHeader: string | null | undefined
): Promise<boolean> {
  const setupId = getCookie(cookieHeader, SETUP_COOKIE_NAME);
  if (!setupId) return false;

  const raw = await db.getSetting(dbInstance, 'temp_setup_session');
  if (!raw) return false;

  try {
    const session = JSON.parse(raw) as { hash: string; expires_at: number };
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at < now) return false;

    const currentHash = await sha256Hex(setupId);
    return constantTimeEqual(
      new TextEncoder().encode(currentHash),
      new TextEncoder().encode(session.hash)
    );
  } catch {
    return false;
  }
}

// POST /api/setup/passkey/options
setupRouter.post('/passkey/options', async (c) => {
  const isAuthorized = await requireSetupCookie(
    c.env.DB,
    c.req.header('Cookie')
  );
  if (!isAuthorized) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Setup session required',
        },
      },
      401
    );
  }

  const url = new URL(c.env.APP_ORIGIN);
  const rpID = url.hostname;
  const adminUserId = 'usr_admin';

  const options = await generateRegistrationOptions({
    rpName: 'NodePulse',
    rpID,
    userID: isoUint8Array.fromUTF8String(adminUserId),
    userName: 'admin',
    userDisplayName: 'Administrator',
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'required',
    },
  });

  const now = Math.floor(Date.now() / 1000);
  const challengeBytes = new TextEncoder().encode(options.challenge);
  await db.saveChallenge(
    c.env.DB,
    'setup:admin',
    challengeBytes,
    'registration',
    now + 60
  );

  return c.json({
    ok: true,
    data: options,
  });
});

// POST /api/setup/passkey/verify
setupRouter.post('/passkey/verify', async (c) => {
  const isAuthorized = await requireSetupCookie(
    c.env.DB,
    c.req.header('Cookie')
  );
  if (!isAuthorized) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Setup session required',
        },
      },
      401
    );
  }

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Invalid registration response body',
        },
      },
      400
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const challengeBytes = await db.consumeChallenge(
    c.env.DB,
    'setup:admin',
    'registration',
    now
  );

  if (!challengeBytes) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Challenge expired or invalid',
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
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: c.env.APP_ORIGIN,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (err: unknown) {
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

  if (!verification.verified || !verification.registrationInfo) {
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

  const { credential, credentialBackedUp, aaguid } =
    verification.registrationInfo;

  // 1. Create admin user
  const adminUserId = 'usr_admin';
  await db.createUser(c.env.DB, {
    id: adminUserId,
    username: 'admin',
    display_name: 'Administrator',
    role: 'admin',
    created_at: now,
  });

  // 2. Save Passkey
  const passkeyId = `pk_${randomTokenHex(8)}`;
  await db.createPasskey(c.env.DB, {
    id: passkeyId,
    user_id: adminUserId,
    credential_id: fromBase64Url(credential.id),
    public_key: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports
      ? JSON.stringify(credential.transports)
      : null,
    aaguid: aaguid || null,
    backed_up: credentialBackedUp ? 1 : 0,
    name: 'Primary Passkey',
    created_at: now,
    last_used_at: now,
  });

  // 3. Mark setup_done = 1
  await db.setSetting(c.env.DB, 'setup_done', '1');

  // 4. Record audit log
  await db.recordAudit(c.env.DB, {
    ts: now,
    user_id: adminUserId,
    action: 'setup_completed',
    target: null,
    details: 'Initial admin account and passkey registered',
    ip_hash: null,
  });

  // 5. Issue admin session
  const sessionId = randomTokenHex(32);
  const sessionHash = await sha256Hex(sessionId);
  await db.createSession(c.env.DB, {
    id_hash: sessionHash,
    user_id: adminUserId,
    created_at: now,
    expires_at: now + 7 * 86400, // 7 days absolute
    last_seen_at: now,
    ip_hash: null,
    ua: c.req.header('User-Agent')?.slice(0, 200) ?? null,
  });

  // Set __Host-np_session and clear __Host-np_setup
  c.header(
    'Set-Cookie',
    buildCookieHeader(SESSION_COOKIE_NAME, sessionId, {
      maxAge: 7 * 86400,
      sameSite: 'Strict',
      path: '/',
    })
  );
  c.header(
    'Set-Cookie',
    buildClearCookieHeader(SETUP_COOKIE_NAME, { path: '/' })
  );

  return c.json({
    ok: true,
    data: { success: true },
  });
});
