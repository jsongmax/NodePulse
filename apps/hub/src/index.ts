import { Hono } from 'hono';
import type { Env } from './types.js';
import { Hub } from './hub.js';
import { setupRouter } from './api/setup.js';
import { authRouter } from './api/auth.js';
import { shareRouter } from './api/share.js';
import * as db from './db/index.js';

export { Hub };

const app = new Hono<{ Bindings: Env }>();

// Global security headers for all API requests
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
});

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

// 404 fallback
app.notFound((c) => {
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
