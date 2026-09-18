import type { Context, Next } from 'hono';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import { getCookie, SESSION_COOKIE_NAME, VIEW_COOKIE_NAME } from './cookies.js';
import { sha256Hex } from './crypto.js';

export interface AuthContext {
  kind: 'admin' | 'view';
  userId?: string;
  user?: db.UserRecord;
  sessionIdHash?: string;
  viewTokenId?: string;
  scope?: unknown;
  expiresAt?: number;
}

declare module 'hono' {
  interface ContextVariableMap {
    auth?: AuthContext;
  }
}

export async function authenticate(
  c: Context<{ Bindings: Env }>
): Promise<AuthContext | null> {
  const cookieHeader = c.req.header('Cookie');
  const now = Math.floor(Date.now() / 1000);

  // 1. Check admin session (__Host-np_session)
  const sessionToken = getCookie(cookieHeader, SESSION_COOKIE_NAME);
  if (sessionToken) {
    const idHash = await sha256Hex(sessionToken);
    const session = await db.findSessionByIdHash(c.env.DB, idHash);

    if (session) {
      // Check absolute expiration (7 days) and idle expiration (12 hours)
      const isExpired =
        session.expires_at < now || now - session.last_seen_at > 12 * 3600;

      if (isExpired) {
        await db.deleteSession(c.env.DB, idHash);
      } else {
        // Touch last_seen_at at most once every 5 minutes to save writes
        if (now - session.last_seen_at > 300) {
          await db.touchSession(c.env.DB, idHash, now);
        }

        const user = await db.findUserById(c.env.DB, session.user_id);
        if (user) {
          const auth: AuthContext = {
            kind: 'admin',
            userId: user.id,
            user,
            sessionIdHash: idHash,
            expiresAt: session.expires_at,
          };
          c.set('auth', auth);
          return auth;
        }
      }
    }
  }

  // 2. Check view session (__Host-np_view)
  const viewTokenCookie = getCookie(cookieHeader, VIEW_COOKIE_NAME);
  if (viewTokenCookie) {
    const tokenHash = await sha256Hex(viewTokenCookie);
    const viewToken = await db.findViewTokenByHash(c.env.DB, tokenHash);

    if (viewToken) {
      const isExpired =
        viewToken.expires_at !== null && viewToken.expires_at < now;
      if (!isExpired && !viewToken.revoked_at) {
        if (!viewToken.last_used_at || now - viewToken.last_used_at > 300) {
          await db.touchViewToken(c.env.DB, viewToken.id, now);
        }

        let scope: unknown = {};
        try {
          scope = JSON.parse(viewToken.scope);
        } catch {
          scope = {};
        }

        const auth: AuthContext = {
          kind: 'view',
          viewTokenId: viewToken.id,
          scope,
          expiresAt: viewToken.expires_at ?? undefined,
        };
        c.set('auth', auth);
        return auth;
      }
    }
  }

  return null;
}

// Middleware: Require Admin
export async function requireAdmin(c: Context<{ Bindings: Env }>, next: Next) {
  let auth = c.get('auth');
  if (!auth) {
    auth = (await authenticate(c)) ?? undefined;
  }

  if (!auth) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
        },
      },
      401
    );
  }

  if (auth.kind !== 'admin') {
    return c.json(
      {
        ok: false,
        error: {
          code: 'forbidden',
          message: 'Admin access required',
        },
      },
      403
    );
  }

  await next();
}

// Middleware: Require View or Admin
export async function requireView(c: Context<{ Bindings: Env }>, next: Next) {
  let auth = c.get('auth');
  if (!auth) {
    auth = (await authenticate(c)) ?? undefined;
  }

  if (!auth) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'unauthorized',
          message: 'Authentication required',
        },
      },
      401
    );
  }

  await next();
}
