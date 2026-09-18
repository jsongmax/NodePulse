import React, { useState } from 'react';
import { Sliders, Save, Check } from 'lucide-react';
import { useI18n } from '../../i18n/index.js';
import { useServerStore } from '../../store/serverStore.js';

export function AdminSettingsPage() {
  const { t } = useI18n();
  const site = useServerStore((s) => s.site);

  const [siteName, setSiteName] = useState(site?.name || 'NodePulse');
  const [publicMode, setPublicMode] = useState(site?.public_mode || false);
  const [interval, setInterval] = useState(10);
  const [retentionDays, setRetentionDays] = useState(90);
  const [saved, setSaved] = useState(false);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-fg-1">
          {t('nav.settings')}
        </h2>
        <p className="text-xs text-fg-3 mt-1">
          全局站点参数、公开模式与保留策略
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="p-6 rounded-2xl bg-bg-1 border border-line-1 space-y-5 select-none"
      >
        {/* Site Name */}
        <div>
          <label className="block text-xs font-semibold text-fg-1 mb-1.5">
            站点名称
          </label>
          <input
            type="text"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-bg-2 border border-line-1 text-xs text-fg-1 focus:outline-none focus:border-accent"
          />
        </div>

        {/* Public Mode Toggle */}
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-bg-2 border border-line-1">
          <div>
            <span className="text-xs font-semibold text-fg-1 block">
              公开大屏与访客只读模式 (Public Mode)
            </span>
            <span className="text-[11px] text-fg-3 block mt-0.5 leading-relaxed">
              开启后，未认证访客可直接访问前端总览和大屏，仅暴露白名单脱敏指标（主机名、IP、内核等自动隐藏）。
            </span>
          </div>
          <input
            type="checkbox"
            checked={publicMode}
            onChange={(e) => setPublicMode(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-line-2 text-accent focus:ring-accent cursor-pointer"
          />
        </div>

        {/* Default Interval */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-fg-1 mb-1.5">
              默认采样上报周期
            </label>
            <select
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-2 border border-line-1 text-xs text-fg-1 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value={5}>5 秒</option>
              <option value={10}>10 秒 (推荐默认)</option>
              <option value={30}>30 秒</option>
              <option value={60}>60 秒 (极端节能)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-fg-1 mb-1.5">
              D1 历史数据保留期限
            </label>
            <select
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-bg-2 border border-line-1 text-xs text-fg-1 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value={30}>30 天</option>
              <option value={90}>90 天 (推荐)</option>
              <option value={180}>180 天</option>
              <option value={365}>365 天</option>
            </select>
          </div>
        </div>

        <div className="pt-3 border-t border-line-1 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent text-bg-0 font-medium text-xs hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4 text-state-ok" />
                <span>配置已保存</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>保存设置</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
