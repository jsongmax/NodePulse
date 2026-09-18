import React from 'react';
import { WifiOff } from 'lucide-react';
import { useServerStore } from '../../store/serverStore.js';
import { useI18n } from '../../i18n/index.js';

export function DisconnectedBanner() {
  const connectionStatus = useServerStore((s) => s.connectionStatus);
  const { t } = useI18n();

  if (connectionStatus === 'connected') {
    return null;
  }

  return (
    <aside
      role="alert"
      className="bg-state-warn/15 border-b border-state-warn/25 px-4 py-2 text-xs text-state-warn flex items-center justify-center gap-2 select-none animate-fadeIn"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-state-warn opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-state-warn" />
      </span>
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span className="font-medium">
        {connectionStatus === 'connecting'
          ? '正在连接实时天文台服务...'
          : t('common.disconnected')}
      </span>
    </aside>
  );
}
