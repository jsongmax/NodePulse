import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from '@tanstack/react-router';
import {
  ArrowLeft,
  Cpu,
  Database,
  HardDrive,
  Activity,
  ArrowDown,
  ArrowUp,
  Network,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { useServerStore } from '../store/serverStore.js';
import { useI18n } from '../i18n/index.js';
import { StatusDot } from '../components/ui/StatusDot.js';
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart.js';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { NumberTween } from '../components/charts/NumberTween.js';
import {
  formatBytes,
  formatThroughput,
  formatUptime,
  formatRelativeTime,
} from '../utils/format.js';
import type { RingPoint } from '@nodepulse/protocol';

export function ServerDetailPage() {
  const { id } = useParams({ from: '/server/$id' });
  const { t } = useI18n();

  const server = useServerStore((s) => s.servers[id]);
  const [range, setRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [seriesData, setSeriesData] = useState<RingPoint[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);

  // Fetch series data when id or range changes
  useEffect(() => {
    if (!id) return;
    setLoadingSeries(true);
    setSeriesError(null);

    fetch(`/api/servers/${id}/series?range=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then((json: any) => {
        if (json?.points && Array.isArray(json.points)) {
          setSeriesData(json.points);
        } else {
          setSeriesData([]);
        }
      })
      .catch((err) => {
        setSeriesError(err instanceof Error ? err.message : '获取时序失败');
      })
      .finally(() => {
        setLoadingSeries(false);
      });
  }, [id, range]);

  // Transform RingPoint[] into uPlot aligned data arrays
  const chartData = useMemo(() => {
    // If seriesData is empty, provide current timestamp
    if (!seriesData || seriesData.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      return {
        cpu: [[now], [0]] as [number[], ...number[][]],
        mem: [[now], [0], [0]] as [number[], ...number[][]],
        net: [[now], [0], [0]] as [number[], ...number[][]],
      };
    }

    const timestamps: number[] = [];
    const cpuAvg: number[] = [];
    const memAvg: number[] = [];
    const swapAvg: number[] = [];
    const netInAvg: number[] = [];
    const netOutAvg: number[] = [];

    for (const p of seriesData) {
      timestamps.push(p[0]); // ts
      cpuAvg.push(p[1]); // cpu_a
      memAvg.push(p[3]); // mem_a
      swapAvg.push(p[5]); // swap_a
      netInAvg.push(p[9]); // nin_a
      netOutAvg.push(p[11]); // nout_a
    }

    return {
      cpu: [timestamps, cpuAvg] as [number[], ...number[][]],
      mem: [timestamps, memAvg, swapAvg] as [number[], ...number[][]],
      net: [timestamps, netInAvg, netOutAvg] as [number[], ...number[][]],
    };
  }, [seriesData]);

  if (!server) {
    return (
      <div className="py-8">
        <LoadingSkeleton count={3} />
      </div>
    );
  }

  const last = server.last;
  const cpuPercent = last ? last.cpu : 0;
  const memPercent =
    last && last.mem.t > 0 ? (last.mem.u / last.mem.t) * 100 : 0;
  const diskPercent =
    last && last.dsk.length > 0 && last.dsk[0]!.t > 0
      ? (last.dsk[0]!.u / last.dsk[0]!.t) * 100
      : 0;
  const load1 = last ? last.ld[0] : 0;
  const load5 = last ? last.ld[1] : 0;
  const load15 = last ? last.ld[2] : 0;

  // Monthly traffic progress calculation
  const quotaBytes = server.traffic_quota_bytes ?? 0;
  const usedTrafficBytes = last?.net ? last.net.rx + last.net.tx : 0;
  const trafficPercent =
    quotaBytes > 0
      ? Math.min(100, Math.round((usedTrafficBytes / quotaBytes) * 100))
      : 0;

  return (
    <div className="space-y-6 select-none">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="p-2 rounded-xl bg-bg-1 border border-line-1 text-fg-2 hover:text-fg-1 hover:bg-bg-3 transition-colors cursor-pointer"
            title={t('common.back')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2.5">
            <StatusDot
              state={server.online ? (server.stale ? 'stale' : 'ok') : 'off'}
              size={14}
            />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-fg-1">
              {server.name}
            </h1>
            {server.geo_label && (
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-bg-2 text-fg-2 border border-line-1">
                {server.geo_label}
              </span>
            )}
          </div>
        </div>

        {/* Range Segment Selector */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-bg-1 border border-line-1 text-xs">
          {(['1h', '24h', '7d', '30d'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                range === r
                  ? 'bg-accent text-bg-0 shadow-sm'
                  : 'text-fg-2 hover:text-fg-1'
              }`}
            >
              {t(`server.range${r}` as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Offline Alert Banner */}
      {!server.online && (
        <aside
          role="alert"
          className="p-3.5 rounded-xl bg-state-warn/15 border border-state-warn/25 text-state-warn text-xs flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            该服务器目前处于离线状态。最后一次有效上报时间：{' '}
            {formatRelativeTime(server.lastTs)}。图表展示最后已知历史记录。
          </span>
        </aside>
      )}

      {/* 2. Key Telemetry KPIs (6 cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* CPU */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <div className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
            <span className="font-medium">{t('server.cpu')}</span>
            <Cpu className="w-3.5 h-3.5 text-metric-cpu" />
          </div>
          <div className="text-xl font-bold text-fg-1">
            <NumberTween value={cpuPercent} suffix="%" decimals={1} />
          </div>
        </div>

        {/* Memory */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <div className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
            <span className="font-medium">{t('server.memory')}</span>
            <Database className="w-3.5 h-3.5 text-metric-mem" />
          </div>
          <div className="text-xl font-bold text-fg-1">
            <NumberTween value={memPercent} suffix="%" decimals={1} />
          </div>
          <div className="text-[10px] font-mono text-fg-3 mt-1 truncate">
            {formatBytes(last?.mem.u ?? 0)} / {formatBytes(last?.mem.t ?? 0)}
          </div>
        </div>

        {/* Disk */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <div className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
            <span className="font-medium">{t('server.disk')}</span>
            <HardDrive className="w-3.5 h-3.5 text-metric-disk" />
          </div>
          <div className="text-xl font-bold text-fg-1">
            <NumberTween value={diskPercent} suffix="%" decimals={1} />
          </div>
          <div className="text-[10px] font-mono text-fg-3 mt-1 truncate">
            {last?.dsk[0]
              ? `${formatBytes(last.dsk[0].u)} / ${formatBytes(last.dsk[0].t)}`
              : '-'}
          </div>
        </div>

        {/* Load Average */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <div className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
            <span className="font-medium">系统负载</span>
            <Activity className="w-3.5 h-3.5 text-metric-load" />
          </div>
          <div className="text-xl font-bold font-mono text-metric-load">
            {load1.toFixed(2)}
          </div>
          <div className="text-[10px] font-mono text-fg-3 mt-1 truncate">
            {load5.toFixed(2)} · {load15.toFixed(2)}
          </div>
        </div>

        {/* Throughput */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <div className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
            <span className="font-medium">{t('server.netSpeed')}</span>
            <Network className="w-3.5 h-3.5 text-accent" />
          </div>
          <div className="flex flex-col text-xs font-mono text-fg-1">
            <span className="flex items-center gap-1 text-metric-net-in">
              <ArrowDown className="w-3 h-3" />
              <span>{formatThroughput(last?.net?.rxs ?? 0)}</span>
            </span>
            <span className="flex items-center gap-1 text-metric-net-out">
              <ArrowUp className="w-3 h-3" />
              <span>{formatThroughput(last?.net?.txs ?? 0)}</span>
            </span>
          </div>
        </div>

        {/* Connections & Uptime */}
        <div className="p-3.5 rounded-xl bg-bg-1 border border-line-1">
          <div className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
            <span className="font-medium">连接 / 运行</span>
            <Calendar className="w-3.5 h-3.5 text-state-ok" />
          </div>
          <div className="text-lg font-bold font-mono text-fg-1 truncate">
            {last?.cn?.tcp ?? 0} TCP
          </div>
          <div className="text-[10px] font-mono text-fg-3 mt-1 truncate">
            在线 {last?.up ? formatUptime(last.up) : '-'}
          </div>
        </div>
      </div>

      {/* 3. Main Body: Charts (Left) & Hardware/Traffic Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: TimeSeriesCharts */}
        <div className="lg:col-span-2 space-y-4">
          {/* CPU Chart */}
          <div className="p-4 rounded-xl bg-bg-1 border border-line-1">
            <TimeSeriesChart
              title="CPU 使用率 (1 分钟加权)"
              data={chartData.cpu}
              unit="%"
              height={180}
              series={[
                {
                  label: 'CPU',
                  color: 'var(--color-metric-cpu)',
                },
              ]}
            />
          </div>

          {/* Memory & Swap Chart */}
          <div className="p-4 rounded-xl bg-bg-1 border border-line-1">
            <TimeSeriesChart
              title="内存与 Swap 占用"
              data={chartData.mem}
              unit="%"
              height={180}
              series={[
                {
                  label: 'Memory',
                  color: 'var(--color-metric-mem)',
                },
                {
                  label: 'Swap',
                  color: 'var(--color-metric-swap)',
                },
              ]}
            />
          </div>

          {/* Network Throughput Chart */}
          <div className="p-4 rounded-xl bg-bg-1 border border-line-1">
            <TimeSeriesChart
              title="网络吞吐速率 (下行 / 上行)"
              data={chartData.net}
              unit="bytes/s"
              height={180}
              series={[
                {
                  label: 'Down',
                  color: 'var(--color-metric-net-in)',
                },
                {
                  label: 'Up',
                  color: 'var(--color-metric-net-out)',
                },
              ]}
            />
          </div>
        </div>

        {/* Right 1 Col: Hardware & Monthly Traffic Sidebars */}
        <div className="space-y-4">
          {/* Monthly Traffic Card */}
          <div className="p-4 rounded-xl bg-bg-1 border border-line-1 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg-1 uppercase tracking-wider">
                {t('server.monthlyTraffic')}
              </span>
              <span className="text-xs font-mono text-accent">
                {trafficPercent}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-bg-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  trafficPercent >= 90
                    ? 'bg-state-crit'
                    : trafficPercent >= 80
                      ? 'bg-state-warn'
                      : 'bg-accent'
                }`}
                style={{ width: `${trafficPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
              <div>
                <span className="text-fg-3 block text-[10px]">已用流量</span>
                <span className="text-fg-1 font-medium">
                  {formatBytes(usedTrafficBytes)}
                </span>
              </div>
              <div>
                <span className="text-fg-3 block text-[10px]">月配额</span>
                <span className="text-fg-1 font-medium">
                  {quotaBytes > 0 ? formatBytes(quotaBytes) : '无配额限制'}
                </span>
              </div>
            </div>
          </div>

          {/* Hardware & System Info Panel */}
          <div className="p-4 rounded-xl bg-bg-1 border border-line-1 space-y-3">
            <span className="text-xs font-semibold text-fg-1 uppercase tracking-wider block border-b border-line-1 pb-2">
              {t('server.systemInfo')}
            </span>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-fg-3">{t('server.hostname')}</span>
                <span className="font-mono text-fg-1 truncate max-w-[180px]">
                  {server.static?.hostname || server.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-3">{t('server.os')}</span>
                <span className="font-mono text-fg-1">
                  {server.static?.os
                    ? `${server.static.os} (${server.static.platform || ''})`
                    : 'Linux'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-3">{t('server.kernel')}</span>
                <span className="font-mono text-fg-1 truncate max-w-[180px]">
                  {server.static?.kernel || '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-3">{t('server.arch')}</span>
                <span className="font-mono text-fg-1">
                  {server.static?.arch || 'amd64'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-3">{t('server.virtualization')}</span>
                <span className="font-mono text-fg-1 uppercase">
                  {server.static?.virt || 'KVM'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-3">{t('server.cpuModel')}</span>
                <span className="font-mono text-fg-1 truncate max-w-[180px]">
                  {server.static?.cpu_model || 'vCPU'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-3">CPU 核数</span>
                <span className="font-mono text-fg-1">
                  {server.static?.cpu_cores
                    ? `${server.static.cpu_cores} Cores`
                    : '-'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
