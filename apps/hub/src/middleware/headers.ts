import type { Context, Next } from 'hono';

export const CSP_DIRECTIVE =
  "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

export const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()';

export async function securityHeadersMiddleware(c: Context, next: Next) {
  await next();

  c.header('Content-Security-Policy', CSP_DIRECTIVE);
  c.header(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Permissions-Policy', PERMISSIONS_POLICY);
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');

  const path = c.req.path;
  if (path.startsWith('/api/auth') || path.startsWith('/api/setup')) {
    c.header('Cache-Control', 'private, no-store');
  }
}
