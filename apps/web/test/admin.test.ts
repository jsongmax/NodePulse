import { describe, expect, it } from 'vitest';
import { router } from '../src/router.js';

describe('Admin Console Pages & Navigation (M3-T5)', () => {
  it('registers all admin sub-routes in router', () => {
    expect(router).toBeDefined();
    expect(router.routesByPath['/admin']).toBeDefined();
    expect(router.routesByPath['/admin/servers']).toBeDefined();
    expect(router.routesByPath['/admin/groups']).toBeDefined();
    expect(router.routesByPath['/admin/security']).toBeDefined();
    expect(router.routesByPath['/admin/settings']).toBeDefined();
    expect(router.routesByPath['/admin/usage']).toBeDefined();
  });
});
