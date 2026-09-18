import { create } from 'zustand';
import type {
  SampleWithoutBucket,
  RingPoint,
  HostInfo,
  AlertEvent,
  ServerMeta,
  Group,
  SiteConfig,
} from '@nodepulse/protocol';

export interface ServerRuntimeState {
  id: string;
  name: string;
  group_id?: string | null;
  token_prefix?: string;
  note?: string | null;
  sort_order: number;
  public: boolean;
  geo_lat?: number | null;
  geo_lng?: number | null;
  geo_label?: string | null;
  country?: string | null;
  traffic_quota_bytes?: number | null;
  traffic_reset_day?: number | null;
  traffic_direction?: string | null;
  interval_s: number;

  online: boolean;
  stale: boolean;
  lastTs: number;
  last: SampleWithoutBucket | null;
  static?: HostInfo | null;
  series: RingPoint[];
}

export type ConnectionStatus =
  'connecting' | 'connected' | 'disconnected' | 'error';

interface ServerStoreState {
  connectionStatus: ConnectionStatus;
  servers: Record<string, ServerRuntimeState>;
  groups: Group[];
  site: SiteConfig | null;
  alerts: AlertEvent[];
  selectedGroupId: string | null; // null = all
  searchQuery: string;
  sortBy: 'group' | 'cpu' | 'mem' | 'traffic' | 'name';

  setConnectionStatus: (status: ConnectionStatus) => void;
  setSite: (site: SiteConfig) => void;
  setGroups: (groups: Group[]) => void;
  setInitialData: (data: {
    site: SiteConfig;
    groups: Group[];
    servers: (Partial<ServerMeta> & {
      id: string;
      name: string;
      online?: boolean;
      last_ts?: number;
      last?: SampleWithoutBucket | null;
    })[];
    series_1h?: Record<string, RingPoint[]>;
  }) => void;

  handleSnapshot: (
    servers: Array<{
      id: string;
      online: boolean;
      last: SampleWithoutBucket | null;
      last_ts: number;
    }>
  ) => void;

  handleDelta: (id: string, ts: number, s: SampleWithoutBucket) => void;
  handleBucket: (id: string, p: RingPoint) => void;
  handleServerOnline: (id: string, ts: number, staticInfo?: HostInfo) => void;
  handleServerOffline: (
    id: string,
    ts: number,
    last?: SampleWithoutBucket | null
  ) => void;
  handleAlert: (event: AlertEvent) => void;
  checkStaleness: (nowSec: number) => void;

  setSelectedGroupId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setSortBy: (sort: 'group' | 'cpu' | 'mem' | 'traffic' | 'name') => void;
}

export const useServerStore = create<ServerStoreState>((set, get) => ({
  connectionStatus: 'connecting',
  servers: {},
  groups: [],
  site: null,
  alerts: [],
  selectedGroupId: null,
  searchQuery: '',
  sortBy: 'group',

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setSite: (site) => set({ site }),
  setGroups: (groups) => set({ groups }),

  setInitialData: ({ site, groups, servers, series_1h }) => {
    const serverMap: Record<string, ServerRuntimeState> = {};
    const now = Math.floor(Date.now() / 1000);

    for (const s of servers) {
      const interval = s.interval_s ?? 10;
      const lastTs = s.last_ts ?? 0;
      const isOnline = s.online ?? false;
      const isStale = isOnline && lastTs > 0 && now - lastTs > 3 * interval;

      serverMap[s.id] = {
        id: s.id,
        name: s.name,
        group_id: s.group_id ?? null,
        token_prefix: s.token_prefix,
        note: s.note ?? null,
        sort_order: s.sort_order ?? 0,
        public: s.public ?? false,
        geo_lat: s.geo_lat ?? null,
        geo_lng: s.geo_lng ?? null,
        geo_label: s.geo_label ?? null,
        country: s.country ?? null,
        traffic_quota_bytes: s.traffic_quota_bytes ?? null,
        traffic_reset_day: s.traffic_reset_day ?? null,
        traffic_direction: s.traffic_direction ?? null,
        interval_s: interval,
        online: isOnline,
        stale: isStale,
        lastTs,
        last: s.last ?? null,
        series: series_1h?.[s.id] ?? [],
      };
    }

    set({ site, groups, servers: serverMap });
  },

  handleSnapshot: (snapshotServers) => {
    const currentServers = { ...get().servers };
    const now = Math.floor(Date.now() / 1000);

    for (const snap of snapshotServers) {
      const existing = currentServers[snap.id];
      const interval = existing?.interval_s ?? 10;
      const isStale =
        snap.online && snap.last_ts > 0 && now - snap.last_ts > 3 * interval;

      if (existing) {
        currentServers[snap.id] = {
          ...existing,
          online: snap.online,
          stale: isStale,
          lastTs: snap.last_ts,
          last: snap.last ?? existing.last,
        };
      } else {
        currentServers[snap.id] = {
          id: snap.id,
          name: snap.id,
          sort_order: 0,
          public: true,
          interval_s: interval,
          online: snap.online,
          stale: isStale,
          lastTs: snap.last_ts,
          last: snap.last,
          series: [],
        };
      }
    }

    set({ servers: currentServers });
  },

  handleDelta: (id, ts, s) => {
    const current = get().servers[id];
    if (!current) return;

    set({
      servers: {
        ...get().servers,
        [id]: {
          ...current,
          online: true,
          stale: false,
          lastTs: ts,
          last: s,
        },
      },
    });
  },

  handleBucket: (id, p) => {
    const current = get().servers[id];
    if (!current) return;

    // Append to series and keep at most 1440 points (24 hours of 1-minute points)
    const nextSeries = [...current.series, p];
    if (nextSeries.length > 1440) {
      nextSeries.shift();
    }

    set({
      servers: {
        ...get().servers,
        [id]: {
          ...current,
          series: nextSeries,
        },
      },
    });
  },

  handleServerOnline: (id, ts, staticInfo) => {
    const current = get().servers[id];
    if (!current) return;

    set({
      servers: {
        ...get().servers,
        [id]: {
          ...current,
          online: true,
          stale: false,
          lastTs: ts,
          static: staticInfo ?? current.static,
        },
      },
    });
  },

  handleServerOffline: (id, ts, last) => {
    const current = get().servers[id];
    if (!current) return;

    set({
      servers: {
        ...get().servers,
        [id]: {
          ...current,
          online: false,
          lastTs: ts,
          last: last ?? current.last,
        },
      },
    });
  },

  handleAlert: (event) => {
    set({
      alerts: [event, ...get().alerts.slice(0, 99)],
    });
  },

  checkStaleness: (nowSec) => {
    let hasChanges = false;
    const updatedServers = { ...get().servers };

    for (const [id, s] of Object.entries(updatedServers)) {
      if (s.online && s.lastTs > 0) {
        const isStale = nowSec - s.lastTs > 3 * s.interval_s;
        if (isStale !== s.stale) {
          updatedServers[id] = { ...s, stale: isStale };
          hasChanges = true;
        }
      }
    }

    if (hasChanges) {
      set({ servers: updatedServers });
    }
  },

  setSelectedGroupId: (selectedGroupId) => set({ selectedGroupId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSortBy: (sortBy) => set({ sortBy }),
}));
