import { Hono } from 'hono';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import { sha256Hex } from '../auth/crypto.js';
import { buildCookieHeader, VIEW_COOKIE_NAME } from '../auth/cookies.js';

export const shareRouter = new Hono<{ Bindings: Env }>();

// GET /s/:token
shareRouter.get('/:token', async (c) => {
  const token = c.req.param('token');
  if (!token) {
    return c.text('Not Found', 404);
  }

  const tokenHash = await sha256Hex(token);
  const viewToken = await db.findViewTokenByHash(c.env.DB, tokenHash);

  const now = Math.floor(Date.now() / 1000);
  if (
    !viewToken ||
    viewToken.revoked_at ||
    (viewToken.expires_at && viewToken.expires_at < now)
  ) {
    return c.text('Link expired or invalid', 404);
  }

  await db.touchViewToken(c.env.DB, viewToken.id, now);

  const maxAge = viewToken.expires_at
    ? Math.min(viewToken.expires_at - now, 30 * 86400)
    : 30 * 86400;

  const cookieHeader = buildCookieHeader(VIEW_COOKIE_NAME, token, {
    maxAge: Math.max(maxAge, 0),
    sameSite: 'Lax', // Lax for clicking from chat apps per SECURITY §4.4
    path: '/',
  });

  c.header('Set-Cookie', cookieHeader);
  return c.redirect('/wall?src=share', 302);
});
