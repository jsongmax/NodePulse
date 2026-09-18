import { describe, expect, it } from 'vitest';
import { router } from '../src/router.js';

describe('Web App Routes (M3-T3)', () => {
  it('has all core routes registered in routeTree', () => {
    expect(router).toBeDefined();
    expect(router.routesByPath['/']).toBeDefined();
    expect(router.routesByPath['/login']).toBeDefined();
    expect(router.routesByPath['/setup']).toBeDefined();
    expect(router.routesByPath['/server/$id']).toBeDefined();
    expect(router.routesByPath['/admin']).toBeDefined();
    expect(router.routesByPath['/wall']).toBeDefined();
  });
});
