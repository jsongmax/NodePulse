import React from 'react';
import { Server } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionText,
  onAction,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`p-12 text-center rounded-2xl bg-bg-1 border border-line-1 flex flex-col items-center justify-center max-w-lg mx-auto select-none ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-bg-2 border border-line-2 flex items-center justify-center text-fg-3 mb-4">
        {icon || <Server className="w-7 h-7" />}
      </div>
      <h3 className="text-base font-semibold text-fg-1 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-fg-2 max-w-sm mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-4 py-2 rounded-lg bg-accent text-bg-0 font-medium text-sm hover:brightness-110 active:scale-95 transition-all shadow-sm cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
}
