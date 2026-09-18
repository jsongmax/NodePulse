import { Hono } from 'hono';
import type { Env } from './types.js';
import { Hub } from './hub.js';

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

// Setup status check
app.get('/api/setup/status', async (c) => {
  let setupDone = false;
  if (c.env.DB) {
    try {
      const row = await c.env.DB.prepare(
        'SELECT value FROM settings WHERE key = ?'
      )
        .bind('setup_done')
        .first<{ value: string }>();
      setupDone = row?.value === '1';
    } catch {
      setupDone = false;
    }
  }
  return c.json({
    ok: true,
    data: {
      setup_done: setupDone,
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
