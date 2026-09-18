import { Hono } from 'hono';
import type { Env } from './types.js';
import { Hub } from './hub.js';
import { setupRouter } from './api/setup.js';
import { authRouter } from './api/auth.js';
import { shareRouter } from './api/share.js';
import { adminServersRouter } from './api/admin/servers.js';
import { adminGroupsRouter } from './api/admin/groups.js';
import { adminAlertsRouter } from './api/admin/alerts.js';

import { wsAgentRouter } from './api/ws-agent.js';
import { wsViewRouter } from './api/ws-view.js';
import { viewRouter } from './api/view.js';
import * as db from './db/index.js';
import { securityHeadersMiddleware } from './middleware/headers.js';
import { rateLimitMiddleware } from './middleware/ratelimit.js';
import { csrfMiddleware } from './middleware/csrf.js';

export { Hub };

const app = new Hono<{ Bindings: Env }>();

// 1. Uniform security headers on all responses
app.use('*', securityHeadersMiddleware);

// 2. Rate limiting binding middleware
app.use('*', rateLimitMiddleware);

// 3. CSRF protection on non-GET /api/*
app.use('*', csrfMiddleware);

// Setup page handler: returns 404 once setup_done is 1
app.get('/setup', async (c) => {
  let setupDone = false;
  try {
    setupDone = (await db.getSetting(c.env.DB, 'setup_done')) === '1';
  } catch {
    setupDone = false;
  }
  if (setupDone) {
    return c.text('Not Found', 404);
  }
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('Setup', 200);
});

// Setup APIs
app.route('/api/setup', setupRouter);

// Auth APIs
app.route('/api/auth', authRouter);

// Share links
app.route('/s', shareRouter);

// Admin APIs
app.route('/api/admin/servers', adminServersRouter);
app.route('/api/admin/groups', adminGroupsRouter);
app.route('/api/admin/alerts', adminAlertsRouter);


// Agent WebSocket entrypoint
app.route('/ws/agent', wsAgentRouter);

// Viewer WebSocket entrypoint
app.route('/ws/view', wsViewRouter);

// Public & View read APIs
app.route('/api', viewRouter);

// Site public configuration
app.get('/api/site', async (c) => {
  let siteName = 'NodePulse';
  let publicMode = false;
  let locale = 'zh-CN';
  let timezone = 'UTC';

  // Read settings from D1 if available
  if (c.env.DB) {
    try {
      const rows = await c.env.DB.prepare(
        'SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)'
      )
        .bind('site_name', 'public_mode', 'locale', 'timezone')
        .all<{ key: string; value: string }>();

      if (rows.results) {
        for (const row of rows.results) {
          if (row.key === 'site_name') siteName = row.value;
          if (row.key === 'public_mode') publicMode = row.value === '1';
          if (row.key === 'locale') locale = row.value;
          if (row.key === 'timezone') timezone = row.value;
        }
      }
    } catch {
      // D1 table may not yet be initialized in development
    }
  }

  return c.json({
    ok: true,
    data: {
      name: siteName,
      public_mode: publicMode,
      locale,
      timezone,
      wall: {
        scene: 'map',
        carousel_interval: 60,
        show_fields: ['cpu', 'mem', 'net'],
      },
    },
  });
});

// 404 fallback: serve static SPA assets if available and not an API/WebSocket route
app.notFound(async (c) => {
  if (c.env.ASSETS && !c.req.path.startsWith('/api') && !c.req.path.startsWith('/ws')) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.json(
    {
      ok: false,
      error: {
        code: 'not_found',
        message: 'Resource not found',
      },
    },
    404
  );
});

// 500 error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      ok: false,
      error: {
        code: 'internal_error',
        message: 'Internal server error',
      },
    },
    500
  );
});

export default app;
