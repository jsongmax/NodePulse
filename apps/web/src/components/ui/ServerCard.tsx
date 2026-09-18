import React from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ServerRuntimeState } from '../../store/serverStore.js';
import { StatusDot } from './StatusDot.js';
import { ArcGauge } from '../charts/ArcGauge.js';
import { Sparkline } from '../charts/Sparkline.js';
import { formatThroughput, formatUptime } from '../../utils/format.js';

export interface ServerCardProps {
  server: ServerRuntimeState;
}

export function ServerCard({ server }: ServerCardProps) {
  const { online, stale, last, lastTs, series } = server;

  // Derive status state
  let statusState: 'ok' | 'warn' | 'crit' | 'off' | 'stale' = 'ok';
  if (!online) {
    statusState = 'off';
  } else if (stale) {
    statusState = 'stale';
  } else if (last) {
    if (
      last.cpu >= 90 ||
      (last.mem.t > 0 && (last.mem.u / last.mem.t) * 100 >= 90)
    ) {
      statusState = 'crit';
    } else if (
      last.cpu >= 80 ||
      (last.mem.t > 0 && (last.mem.u / last.mem.t) * 100 >= 80)
    ) {
      statusState = 'warn';
    }
  }

  // Calculate percentages
  const cpuPercent = last ? last.cpu : 0;
  const memPercent =
    last && last.mem.t > 0 ? (last.mem.u / last.mem.t) * 100 : 0;
  const diskPercent =
    last && last.dsk.length > 0 && last.dsk[0]!.t > 0
      ? (last.dsk[0]!.u / last.dsk[0]!.t) * 100
      : 0;

  // Extract CPU series history for sparkline (last 30 points)
  const cpuHistory =
    series.length > 0
      ? series.slice(-30).map((p) => p[1])
      : [cpuPercent, cpuPercent];

  const netInRate = last?.net?.rxs ?? 0;
  const netOutRate = last?.net?.txs ?? 0;
  const uptimeStr = last?.up ? formatUptime(last.up) : '-';

  // Border & card background classes
  const borderClass =
    statusState === 'crit'
      ? 'border-state-crit shadow-sm'
      : statusState === 'warn'
        ? 'border-l-4 border-l-state-warn border-line-1'
        : 'border-line-1';

  const opacityClass = !online ? 'opacity-60' : '';

  return (
    <Link
      to="/server/$id"
      params={{ id: server.id }}
      className={`group block p-4 rounded-xl bg-bg-1 border ${borderClass} ${opacityClass} hover:bg-bg-3/40 hover:-translate-y-0.5 transition-all duration-200 select-none`}
    >
      {/* 1. Header: Status + Name + Region + Uptime */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot state={statusState} />
          <span className="font-semibold text-sm text-fg-1 truncate group-hover:text-accent transition-colors">
            {server.name}
          </span>
          {server.geo_label && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-bg-2 text-fg-2 border border-line-1 truncate">
              {server.geo_label}
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono text-xs text-fg-3">
            {online ? uptimeStr : '离线'}
          </span>
        </div>
      </div>

      {/* 2. Gauges: CPU / MEM / DISK */}
      <div className="grid grid-cols-3 gap-2 py-1 mb-3">
        <ArcGauge value={cpuPercent} label="CPU" metric="cpu" size={56} />
        <ArcGauge value={memPercent} label="MEM" metric="mem" size={56} />
        <ArcGauge value={diskPercent} label="DISK" metric="disk" size={56} />
      </div>

      {/* 3. Footer: Live Throughput + Sparkline */}
      <div className="flex items-center justify-between pt-2 border-t border-line-1">
        <div className="flex flex-col text-[11px] font-mono text-fg-2">
          <span className="flex items-center gap-1">
            <ArrowDown className="w-3 h-3 text-metric-net-in shrink-0" />
            <span className="tabular-nums">{formatThroughput(netInRate)}</span>
          </span>
          <span className="flex items-center gap-1">
            <ArrowUp className="w-3 h-3 text-metric-net-out shrink-0" />
            <span className="tabular-nums">{formatThroughput(netOutRate)}</span>
          </span>
        </div>
        <div className="flex items-center">
          <Sparkline
            data={cpuHistory}
            width={88}
            height={24}
            color={
              statusState === 'crit'
                ? 'var(--color-state-crit)'
                : statusState === 'warn'
                  ? 'var(--color-state-warn)'
                  : 'var(--color-metric-cpu)'
            }
          />
        </div>
      </div>
    </Link>
  );
}
