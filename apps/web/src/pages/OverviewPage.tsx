import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Search, ArrowUpDown, Server } from 'lucide-react';
import { useServerStore } from '../store/serverStore.js';
import { useI18n } from '../i18n/index.js';
import { ServerCard } from '../components/ui/ServerCard.js';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { NumberTween } from '../components/charts/NumberTween.js';
import { formatThroughput } from '../utils/format.js';

export function OverviewPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const {
    servers,
    groups,
    selectedGroupId,
    setSelectedGroupId,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    setInitialData,
  } = useServerStore();

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Initial bootstrap fetch
  async function loadBootstrap() {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) {
        if (res.status === 401) {
          navigate({ to: '/login' });
          return;
        }
        throw new Error(`HTTP error ${res.status}`);
      }

      const json = await res.json();
      if (json.ok && json.data) {
        setInitialData(json.data);
      }
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBootstrap();
  }, []);

  // Filter and sort servers
  const serverList = useMemo(() => {
    return Object.values(servers).filter((s) => {
      // Group filter
      if (selectedGroupId && s.group_id !== selectedGroupId) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q);
        const matchGeo = s.geo_label?.toLowerCase().includes(q) ?? false;
        const matchHost =
          s.static?.hostname?.toLowerCase().includes(q) ?? false;
        if (!matchName && !matchGeo && !matchHost) {
          return false;
        }
      }
      return true;
    });
  }, [servers, selectedGroupId, searchQuery]);

  const sortedServers = useMemo(() => {
    const list = [...serverList];
    switch (sortBy) {
      case 'cpu':
        return list.sort((a, b) => (b.last?.cpu ?? 0) - (a.last?.cpu ?? 0));
      case 'mem':
        return list.sort((a, b) => {
          const aMem =
            a.last && a.last.mem.t > 0 ? a.last.mem.u / a.last.mem.t : 0;
          const bMem =
            b.last && b.last.mem.t > 0 ? b.last.mem.u / b.last.mem.t : 0;
          return bMem - aMem;
        });
      case 'traffic':
        return list.sort(
          (a, b) =>
            (b.last?.net?.rxs ?? 0) +
            (b.last?.net?.txs ?? 0) -
            ((a.last?.net?.rxs ?? 0) + (a.last?.net?.txs ?? 0))
        );
      case 'name':
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case 'group':
      default:
        return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
  }, [serverList, sortBy]);

  // Compute fleet summary stats
  const allServers = Object.values(servers);
  const totalCount = allServers.length;
  const onlineCount = allServers.filter((s) => s.online).length;

  const fleetCpu = useMemo(() => {
    const active = allServers.filter((s) => s.online && s.last);
    if (active.length === 0) return 0;
    const sum = active.reduce((acc, s) => acc + (s.last?.cpu ?? 0), 0);
    return sum / active.length;
  }, [allServers]);

  const fleetMem = useMemo(() => {
    const active = allServers.filter(
      (s) => s.online && s.last && s.last.mem.t > 0
    );
    if (active.length === 0) return 0;
    const sum = active.reduce(
      (acc, s) => acc + ((s.last?.mem.u ?? 0) / (s.last?.mem.t ?? 1)) * 100,
      0
    );
    return sum / active.length;
  }, [allServers]);

  const fleetNetIn = useMemo(() => {
    return allServers
      .filter((s) => s.online && s.last)
      .reduce((acc, s) => acc + (s.last?.net?.rxs ?? 0), 0);
  }, [allServers]);

  const fleetNetOut = useMemo(() => {
    return allServers
      .filter((s) => s.online && s.last)
      .reduce((acc, s) => acc + (s.last?.net?.txs ?? 0), 0);
  }, [allServers]);

  const criticalCount = useMemo(() => {
    return allServers.filter((s) => {
      if (!s.online || !s.last) return false;
      return (
        s.last.cpu >= 90 ||
        (s.last.mem.t > 0 && (s.last.mem.u / s.last.mem.t) * 100 >= 90)
      );
    }).length;
  }, [allServers]);

  return (
    <div className="space-y-6 select-none">
      {/* 1. Fleet KPI Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Online rate */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <span className="text-[11px] font-medium text-fg-2 uppercase tracking-wider block mb-1">
            {t('dashboard.fleetOnline')}
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-xl font-bold text-fg-1 tabular-nums">
              {onlineCount}
            </span>
            <span className="text-xs text-fg-2">/ {totalCount}</span>
          </div>
        </div>

        {/* Avg CPU */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <span className="text-[11px] font-medium text-fg-2 uppercase tracking-wider block mb-1">
            {t('dashboard.fleetCpu')}
          </span>
          <div className="text-xl font-bold text-metric-cpu">
            <NumberTween value={fleetCpu} suffix="%" decimals={1} />
          </div>
        </div>

        {/* Avg Memory */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <span className="text-[11px] font-medium text-fg-2 uppercase tracking-wider block mb-1">
            {t('dashboard.fleetMem')}
          </span>
          <div className="text-xl font-bold text-metric-mem">
            <NumberTween value={fleetMem} suffix="%" decimals={1} />
          </div>
        </div>

        {/* Net Download */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <span className="text-[11px] font-medium text-fg-2 uppercase tracking-wider block mb-1">
            ↓ {t('dashboard.fleetNetDown')}
          </span>
          <div className="text-xl font-bold font-mono text-metric-net-in truncate">
            {formatThroughput(fleetNetIn)}
          </div>
        </div>

        {/* Net Upload */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <span className="text-[11px] font-medium text-fg-2 uppercase tracking-wider block mb-1">
            ↑ {t('dashboard.fleetNetUp')}
          </span>
          <div className="text-xl font-bold font-mono text-metric-net-out truncate">
            {formatThroughput(fleetNetOut)}
          </div>
        </div>

        {/* Active Alerts */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <span className="text-[11px] font-medium text-fg-2 uppercase tracking-wider block mb-1">
            {t('dashboard.activeAlerts')}
          </span>
          <div
            className={`text-xl font-bold font-mono ${
              criticalCount > 0
                ? 'text-state-crit animate-pulse'
                : 'text-state-ok'
            }`}
          >
            {criticalCount}
          </div>
        </div>
      </div>

      {/* 2. Controls Toolbar: Groups, Search & Sort */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Group Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              selectedGroupId === null
                ? 'bg-accent text-bg-0 shadow-sm'
                : 'bg-bg-2 text-fg-2 hover:text-fg-1 hover:bg-bg-3'
            }`}
          >
            {t('common.all')} ({totalCount})
          </button>
          {groups.map((g) => {
            const count = allServers.filter((s) => s.group_id === g.id).length;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setSelectedGroupId(g.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  selectedGroupId === g.id
                    ? 'bg-accent text-bg-0 shadow-sm'
                    : 'bg-bg-2 text-fg-2 hover:text-fg-1 hover:bg-bg-3'
                }`}
              >
                {g.name} ({count})
              </button>
            );
          })}
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-fg-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search')}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-bg-2 border border-line-1 text-xs text-fg-1 placeholder-fg-3 focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Sort selector */}
          <div className="relative">
            <select
              value={sortBy}
              aria-label={t('common.sort')}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="appearance-none pl-7 pr-8 py-1.5 rounded-lg bg-bg-2 border border-line-1 text-xs text-fg-2 hover:text-fg-1 focus:outline-none focus:border-accent transition-colors cursor-pointer"
            >
              <option value="group">{t('dashboard.sortByGroup')}</option>
              <option value="cpu">{t('dashboard.sortByCpu')}</option>
              <option value="mem">{t('dashboard.sortByMem')}</option>
              <option value="traffic">{t('dashboard.sortByTraffic')}</option>
              <option value="name">{t('dashboard.sortByName')}</option>
            </select>
            <ArrowUpDown className="w-3 h-3 text-fg-3 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* 3. Content States */}
      {loading ? (
        <LoadingSkeleton count={6} />
      ) : fetchError ? (
        <ErrorState
          title={t('common.error')}
          message={fetchError}
          onRetry={loadBootstrap}
        />
      ) : sortedServers.length === 0 ? (
        <EmptyState
          title={t('dashboard.emptyTitle')}
          description={t('dashboard.emptyDesc')}
          actionText={t('dashboard.addServerButton')}
          onAction={() => navigate({ to: '/admin' })}
          icon={<Server className="w-7 h-7 text-accent" />}
        />
      ) : (
        /* Server Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {sortedServers.map((server) => (
            <ServerCard key={server.id} server={server} />
          ))}
        </div>
      )}
    </div>
  );
}
