import React from 'react';
import { ShieldAlert, Info, Zap } from 'lucide-react';
import { useServerStore } from '../../store/serverStore.js';
import { useI18n } from '../../i18n/index.js';

interface QuotaCardProps {
  label: string;
  used: number;
  limit: number;
  unit: string;
  perServerFormula: string;
}

function QuotaCard({
  label,
  used,
  limit,
  unit,
  perServerFormula,
}: QuotaCardProps) {
  const percent = Math.min(100, Math.round((used / limit) * 100));
  const isWarning = percent >= 80;

  return (
    <div className="p-4 rounded-xl bg-bg-1 border border-line-1 space-y-3 select-none">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-fg-1">{label}</span>
        <span
          className={`font-mono text-xs font-bold ${
            isWarning ? 'text-state-warn animate-pulse' : 'text-fg-2'
          }`}
        >
          {percent}%
        </span>
      </div>

      {/* Progress Bar with 80% Threshold Mark */}
      <div className="relative w-full h-2.5 rounded-full bg-bg-3 overflow-hidden">
        {/* 80% marker line */}
        <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-state-crit/60 z-10" />
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isWarning ? 'bg-state-warn' : 'bg-accent'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs font-mono">
        <span className="text-fg-1 font-medium">
          {used.toLocaleString()} {unit}
        </span>
        <span className="text-fg-3">
          上限 {limit.toLocaleString()} {unit}
        </span>
      </div>

      <div className="text-[10px] text-fg-3 pt-1 border-t border-line-1">
        单机预估: {perServerFormula}
      </div>
    </div>
  );
}

export function AdminUsagePage() {
  const { t } = useI18n();
  const servers = useServerStore((s) => s.servers);
  const serverCount = Math.max(1, Object.keys(servers).length);

  // Formulas per ARCHITECTURE.md §7:
  // 1. Worker requests: ≈ 1,500 base + 50 * N
  const workerRequests = 1500 + serverCount * 50;
  // 2. DO requests: (servers * 86400 / interval) / 20 + 1440
  const doRequests = Math.round((serverCount * 86400) / 10 / 20 + 1440);
  // 3. DO row writes: servers * 1440 + 1600
  const doRowWrites = serverCount * 1440 + 1600;
  // 4. D1 row writes: ≈ 500 + servers * 15
  const d1RowWrites = 500 + serverCount * 15;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-fg-1">
            {t('nav.usage')}
          </h2>
          <p className="text-xs text-fg-3 mt-1">
            Cloudflare Workers 免费额度监控与精确容量核算 (80% 红线告警)
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-state-ok/15 text-state-ok border border-state-ok/20 text-xs font-medium">
          <Zap className="w-3.5 h-3.5" />
          <span>免费额度充足</span>
        </div>
      </div>

      {/* 4 Quota Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <QuotaCard
          label="Worker 请求 (次/天)"
          used={workerRequests}
          limit={100000}
          unit="次"
          perServerFormula="≈ 50 次/天"
        />
        <QuotaCard
          label="DO 请求 (次/天, 20:1)"
          used={doRequests}
          limit={100000}
          unit="次"
          perServerFormula="≈ 432 次/天"
        />
        <QuotaCard
          label="DO 行写 (ring_1m, /天)"
          used={doRowWrites}
          limit={100000}
          unit="行"
          perServerFormula="1,440 行/天"
        />
        <QuotaCard
          label="D1 行写 (汇总冷数据, /天)"
          used={d1RowWrites}
          limit={100000}
          unit="行"
          perServerFormula="≈ 15 行/天"
        />
      </div>

      {/* Capacity Guidance & Calculation Table */}
      <div className="p-5 rounded-2xl bg-bg-1 border border-line-1 space-y-3 text-xs leading-relaxed select-none">
        <div className="flex items-center gap-2 font-semibold text-fg-1">
          <Info className="w-4 h-4 text-accent" />
          <span>免费额度设计护栏与容量建议</span>
        </div>
        <p className="text-fg-2">
          NodePulse 采用
          <strong>
            “单例 Durable Object + WebSocket Hibernation + 环形表覆写”
          </strong>
          极致压缩架构。 入站 WebSocket 消息按 20:1 折算 DO 请求，热数据落 DO
          SQLite 环形缓冲无需 DELETE 操作。
        </p>
        <ul className="list-disc list-inside space-y-1 text-fg-3 font-mono text-[11px]">
          <li>
            10 秒采样周期下，免费版平稳支持多达 <strong>40 台</strong> VPS
            节点。
          </li>
          <li>
            若需接入 60–80 台节点，建议在设置中将分钟桶切换为 2 分钟粒度。
          </li>
          <li>
            所有监控流量在 WebSocket 建立后直通 DO，不消耗 Worker 100k
            每日调用。
          </li>
        </ul>
      </div>
    </div>
  );
}
