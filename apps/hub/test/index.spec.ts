import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index.js';

describe('Hub Worker API Endpoints', () => {
  it('GET /api/site returns JSON with security headers', async () => {
    const res = await app.request('/api/site', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');

    const json = (await res.json()) as {
      ok: boolean;
      data: { name: string; public_mode: boolean; locale: string };
    };
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('NodePulse');
    expect(json.data.public_mode).toBe(false);
    expect(json.data.locale).toBe('zh-CN');
  });

  it('GET /api/setup/status returns status json', async () => {
    const res = await app.request('/api/setup/status', {}, env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      data: { setup_done: boolean };
    };
    expect(json.ok).toBe(true);
    expect(typeof json.data.setup_done).toBe('boolean');
  });

  it('GET /api/unknown returns 404 json', async () => {
    const res = await app.request('/api/unknown', {}, env);
    expect(res.status).toBe(404);
    const json = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('not_found');
  });
});
