import type { Context, Next } from 'hono';
import type { Env, RateLimiter } from '../types.js';

export function getClientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    '127.0.0.1'
  );
}

export async function rateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next
) {
  const path = c.req.path;
  const ip = getClientIp(c);

  let limiter: RateLimiter | undefined;

  if (
    path.startsWith('/api/auth') ||
    path.startsWith('/api/setup') ||
    path.startsWith('/s/')
  ) {
    limiter = c.env.RL_AUTH;
  } else if (path.startsWith('/ws/agent')) {
    limiter = c.env.RL_AGENT;
  } else if (path.startsWith('/api/')) {
    limiter = c.env.RL_API;
  }

  if (limiter) {
    try {
      const { success } = await limiter.limit({ key: ip });
      if (!success) {
        c.header('Retry-After', '10');
        return c.json(
          {
            ok: false,
            error: {
              code: 'rate_limited',
              message: 'Rate limit exceeded, please retry later',
            },
          },
          429
        );
      }
    } catch {
      // Limiter binding may not be configured in mock test environments
    }
  }

  await next();
}
