import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';

describe('CSRF, Security Headers & Rate Limiting', () => {
  const testEnv = {
    ...env,
    APP_ORIGIN: 'http://localhost:8787',
  };

  it('csrf_rejected_when_origin_or_x_np_request_missing', async () => {
    // 1. Missing Origin
    const noOrigin = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-NP-Request': '1',
        },
        body: JSON.stringify({ token: 'test' }),
      },
      testEnv
    );
    expect(noOrigin.status).toBe(403);
    const json1 = (await noOrigin.json()) as {
      ok: boolean;
      error: { code: string };
    };
    expect(json1.ok).toBe(false);
    expect(json1.error.code).toBe('csrf_rejected');

    // 2. Mismatched Origin
    const wrongOrigin = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'https://evil.attacker.com',
          'X-NP-Request': '1',
        },
        body: JSON.stringify({ token: 'test' }),
      },
      testEnv
    );
    expect(wrongOrigin.status).toBe(403);

    // 3. Missing X-NP-Request
    const noXnp = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
        },
        body: JSON.stringify({ token: 'test' }),
      },
      testEnv
    );
    expect(noXnp.status).toBe(403);

    // 4. Sec-Fetch-Site: cross-site
    const crossSite = await app.request(
      '/api/setup/verify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: testEnv.APP_ORIGIN,
          'X-NP-Request': '1',
          'Sec-Fetch-Site': 'cross-site',
        },
        body: JSON.stringify({ token: 'test' }),
      },
      testEnv
    );
    expect(crossSite.status).toBe(403);
  });

  it('security_headers_present_on_all_responses', async () => {
    const res = await app.request('/api/site', {}, testEnv);
    expect(res.status).toBe(200);

    // Verify all §5.1 mandatory security headers
    expect(res.headers.get('content-security-policy')).toContain(
      "default-src 'none'"
    );
    expect(res.headers.get('strict-transport-security')).toContain(
      'max-age=31536000'
    );
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('permissions-policy')).toContain('camera=()');
    expect(res.headers.get('cross-origin-opener-policy')).toBe('same-origin');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('same-origin');
  });

  it('rate_limiting_returns_429_with_retry_after', async () => {
    const rateLimitedEnv = {
      ...testEnv,
      RL_API: {
        limit: async () => ({ success: false }),
      },
    };

    const res = await app.request('/api/site', {}, rateLimitedEnv);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('10');
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('rate_limited');
  });
});
