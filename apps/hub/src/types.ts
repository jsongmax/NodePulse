import type { Hub } from './hub.js';

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  HUB: DurableObjectNamespace<Hub>;
  DB: D1Database;
  ASSETS?: Fetcher;
  RL_AUTH?: RateLimiter;
  RL_AGENT?: RateLimiter;
  RL_API?: RateLimiter;
  APP_ORIGIN: string;
  SETUP_TOKEN?: string;
  TOKEN_PEPPER?: string;
  MASTER_KEY?: string;
  ACCESS_AUD?: string;
}

declare global {
  namespace Cloudflare {
    interface Env {
      HUB: DurableObjectNamespace<Hub>;
      DB: D1Database;
      ASSETS?: Fetcher;
      RL_AUTH?: RateLimiter;
      RL_AGENT?: RateLimiter;
      RL_API?: RateLimiter;
      APP_ORIGIN: string;
      SETUP_TOKEN?: string;
      TOKEN_PEPPER?: string;
      MASTER_KEY?: string;
      ACCESS_AUD?: string;
    }
  }
}
