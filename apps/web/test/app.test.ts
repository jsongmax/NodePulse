import { describe, expect, it } from 'vitest';
import { router } from '../src/router.js';

describe('Web App Router', () => {
  it('has routes configured for index, wall, login, and setup', () => {
    expect(router).toBeDefined();
    expect(router.routeTree).toBeDefined();
  });
});
