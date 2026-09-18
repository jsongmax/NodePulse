import type { Context, Next } from 'hono';
import type { Env } from '../types.js';

export async function csrfMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const method = c.req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return next();
  }

  const path = c.req.path;
  // CSRF protection applies to all non-GET /api/* endpoints
  if (!path.startsWith('/api/')) {
    return next();
  }

  // 1. Reject Sec-Fetch-Site: cross-site per SECURITY §5.2
  const secFetchSite = c.req.header('Sec-Fetch-Site');
  if (secFetchSite === 'cross-site') {
    return c.json(
      {
        ok: false,
        error: {
          code: 'csrf_rejected',
          message: 'Cross-site request rejected',
        },
      },
      403
    );
  }

  // 2. Validate Origin === APP_ORIGIN
  const origin = c.req.header('Origin');
  if (!origin || origin !== c.env.APP_ORIGIN) {
    return c.json(
      {
        ok: false,
        error: {
          code: 'csrf_rejected',
          message: 'Origin header missing or mismatched',
        },
      },
      403
    );
  }

  // 3. Validate custom header X-NP-Request: 1
  const xnpHeader = c.req.header('X-NP-Request');
  if (xnpHeader !== '1') {
    return c.json(
      {
        ok: false,
        error: {
          code: 'csrf_rejected',
          message: 'X-NP-Request header missing or invalid',
        },
      },
      403
    );
  }

  await next();
}
