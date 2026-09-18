import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = '加载失败',
  message = '网络请求异常或服务端暂时不可用，请尝试刷新。',
  onRetry,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`p-8 text-center rounded-2xl bg-state-crit/10 border border-state-crit/20 flex flex-col items-center justify-center max-w-md mx-auto ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-state-crit/20 text-state-crit flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-semibold text-state-crit mb-1">{title}</h3>
      <p className="text-xs text-fg-2 mb-5 leading-relaxed">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-bg-1 border border-line-2 text-xs font-medium text-fg-1 hover:bg-bg-3 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>重新尝试</span>
        </button>
      )}
    </div>
  );
}
