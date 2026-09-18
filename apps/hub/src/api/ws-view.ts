import { Hono } from 'hono';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import { authenticate } from '../auth/middleware.js';

export const wsViewRouter = new Hono<{ Bindings: Env }>();

// GET /ws/view
wsViewRouter.get('/', async (c) => {
  const upgradeHeader = c.req.header('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return c.text('Expected WebSocket Upgrade', 426);
  }

  // SECURITY §5.2: Validate Origin === APP_ORIGIN for browser WebSocket upgrades
  const origin = c.req.header('Origin');
  if (origin && origin !== c.env.APP_ORIGIN) {
    return c.text('Forbidden: invalid origin', 403);
  }

  // Authenticate: session cookie or view token cookie or public mode
  const auth = await authenticate(c);
  let scope: 'full' | 'public' = 'public';
  let uid = 'anon';

  if (auth) {
    if (auth.kind === 'admin') {
      scope = 'full';
      uid = auth.userId ?? 'admin';
    } else {
      const tokenScope = auth.scope as { fields?: string } | undefined;
      scope = tokenScope?.fields === 'full' ? 'full' : 'public';
      uid = auth.viewTokenId ?? 'viewer';
    }
  } else {
    // Check public mode
    const publicMode = (await db.getSetting(c.env.DB, 'public_mode')) === '1';
    if (!publicMode) {
      return c.text('Unauthorized', 401);
    }
    scope = 'public';
    uid = 'anon';
  }

  // Reconstruct clean request before forwarding to Hub DO
  const forwardHeaders = new Headers();
  for (const [k, v] of c.req.raw.headers) {
    const lk = k.toLowerCase();
    if (
      lk === 'upgrade' ||
      lk === 'connection' ||
      lk.startsWith('sec-websocket-')
    ) {
      forwardHeaders.set(k, v);
    }
  }

  forwardHeaders.set('X-NP-Kind', 'viewer');
  forwardHeaders.set('X-NP-Scope', scope);
  forwardHeaders.set('X-NP-Uid', uid);

  const forwardReq = new Request(c.req.url, {
    method: 'GET',
    headers: forwardHeaders,
  });

  const hubId = c.env.HUB.idFromName('main');
  const hubStub = c.env.HUB.get(hubId);
  return hubStub.fetch(forwardReq);
});
