import { Hono } from 'hono';
import type { Env } from '../types.js';
import * as db from '../db/index.js';
import { authenticate } from '../auth/middleware.js';
import type { RingPoint } from '@nodepulse/protocol';

export const viewRouter = new Hono<{ Bindings: Env }>();

// Helper to check view permission
async function checkViewAccess(
  c: import('hono').Context<{ Bindings: Env }>
): Promise<{ allowed: boolean; scope: 'full' | 'public' }> {
  const auth = await authenticate(c);
  if (auth) {
    if (auth.kind === 'admin') {
      return { allowed: true, scope: 'full' };
    }
    const tokenScope = auth.scope as { fields?: string } | undefined;
    const scope = tokenScope?.fields === 'full' ? 'full' : 'public';
    return { allowed: true, scope };
  }

  const publicMode = (await db.getSetting(c.env.DB, 'public_mode')) === '1';
  if (publicMode) {
    return { allowed: true, scope: 'public' };
  }

  return { allowed: false, scope: 'public' };
}

// GET /api/bootstrap
viewRouter.get('/bootstrap', async (c) => {
  const { allowed, scope } = await checkViewAccess(c);
  if (!allowed) {
    return c.json(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Authentication required' },
      },
      401
    );
  }

  const siteName = (await db.getSetting(c.env.DB, 'site_name')) || 'NodePulse';
  const publicMode = (await db.getSetting(c.env.DB, 'public_mode')) === '1';
  const locale = (await db.getSetting(c.env.DB, 'locale')) || 'zh-CN';
  const timezone = (await db.getSetting(c.env.DB, 'timezone')) || 'UTC';

  const groups = await db.listGroups(c.env.DB);
  const servers = await db.listServers(c.env.DB, false);

  // Get live snapshot from Hub DO
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  const snapshotRaw = (await hubStub.getSnapshot(scope)) as {
    servers?: Array<{
      id: string;
      online: boolean;
      last: unknown;
      last_ts: number;
    }>;
  };
  const liveMap = new Map<
    string,
    { online: boolean; last: unknown; last_ts: number }
  >();
  if (snapshotRaw && snapshotRaw.servers) {
    for (const s of snapshotRaw.servers) {
      liveMap.set(s.id, s);
    }
  }

  const serverItems = servers.map((s) => {
    const live = liveMap.get(s.id);
    const item: Record<string, unknown> = {
      id: s.id,
      name: s.name,
      group_id: s.group_id,
      sort_order: s.sort_order,
      public: s.public === 1,
      geo_lat: s.geo_lat,
      geo_lng: s.geo_lng,
      geo_label: s.geo_label,
      country: s.country,
      interval_s: s.interval_s,
      online: live?.online ?? false,
      last_ts: live?.last_ts ?? 0,
      last: live?.last ?? null,
    };

    if (scope === 'full') {
      item.token_prefix = s.token_prefix;
      item.note = s.note;
      item.traffic_quota_bytes = s.traffic_quota_bytes;
      item.traffic_reset_day = s.traffic_reset_day;
      item.traffic_direction = s.traffic_direction;
    }

    return item;
  });

  // Pull 1h series for each server
  const series1h: Record<string, RingPoint[]> = {};
  for (const s of servers) {
    try {
      const res = await hubStub.getSeries(s.id, '1h');
      if (res.status === 200) {
        const json = (await res.json()) as { points: RingPoint[] };
        series1h[s.id] = json.points;
      }
    } catch {
      series1h[s.id] = [];
    }
  }

  return c.json({
    ok: true,
    data: {
      site: {
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
      groups,
      servers: serverItems,
      series_1h: series1h,
    },
  });
});

// GET /api/servers/:id
viewRouter.get('/servers/:id', async (c) => {
  const { allowed, scope } = await checkViewAccess(c);
  if (!allowed) {
    return c.json(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Authentication required' },
      },
      401
    );
  }

  const id = c.req.param('id');
  const server = await db.findServerById(c.env.DB, id);
  if (!server) {
    return c.json(
      {
        ok: false,
        error: { code: 'not_found', message: 'Server not found' },
      },
      404
    );
  }

  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  const snapshotRaw = (await hubStub.getSnapshot(scope)) as {
    servers?: Array<{
      id: string;
      online: boolean;
      last: unknown;
      last_ts: number;
    }>;
  };
  const live = snapshotRaw?.servers?.find((s) => s.id === id);

  const serverData: Record<string, unknown> = {
    id: server.id,
    name: server.name,
    group_id: server.group_id,
    sort_order: server.sort_order,
    public: server.public === 1,
    geo_lat: server.geo_lat,
    geo_lng: server.geo_lng,
    geo_label: server.geo_label,
    country: server.country,
    interval_s: server.interval_s,
    online: live?.online ?? false,
    last_ts: live?.last_ts ?? 0,
    last: live?.last ?? null,
  };

  if (scope === 'full') {
    serverData.token_prefix = server.token_prefix;
    serverData.note = server.note;
    serverData.traffic_quota_bytes = server.traffic_quota_bytes;
    serverData.traffic_reset_day = server.traffic_reset_day;
    serverData.traffic_direction = server.traffic_direction;
  }

  return c.json({
    ok: true,
    data: serverData,
  });
});

// GET /api/servers/:id/series
viewRouter.get('/servers/:id/series', async (c) => {
  const { allowed } = await checkViewAccess(c);
  if (!allowed) {
    return c.json(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Authentication required' },
      },
      401
    );
  }

  const id = c.req.param('id');
  const range = c.req.query('range') ?? '24h';

  // Cache API 60s check per ARCHITECTURE §3.2 & §6
  // Construct clean cache key without cookies
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const url = new URL(c.req.url);
  const cacheKey = new Request(url.toString(), { method: 'GET' });

  if (cache) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  // Pass-through directly from Hub DO to preserve 10ms CPU limit!
  const hubStub = c.env.HUB.get(c.env.HUB.idFromName('main'));
  const hubResponse = await hubStub.getSeries(id, range);

  if (cache && hubResponse.status === 200) {
    const responseToCache = hubResponse.clone();
    try {
      let ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
      try {
        ctx = c.executionCtx as unknown as {
          waitUntil?: (p: Promise<unknown>) => void;
        };
      } catch {
        ctx = undefined;
      }
      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(cache.put(cacheKey, responseToCache));
      } else {
        await cache.put(cacheKey, responseToCache);
      }
    } catch {
      // Best-effort cache put
    }
  }

  return hubResponse;
});
