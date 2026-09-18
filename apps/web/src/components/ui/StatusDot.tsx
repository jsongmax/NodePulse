import React from 'react';

export type StatusState = 'ok' | 'warn' | 'crit' | 'off' | 'stale';

export interface StatusDotProps {
  state: StatusState;
  size?: 8 | 10 | 14;
  className?: string;
}

export function StatusDot({
  state,
  size = 10,
  className = '',
}: StatusDotProps) {
  const sizeClass =
    size === 14 ? 'w-3.5 h-3.5' : size === 8 ? 'w-2 h-2' : 'w-2.5 h-2.5';

  if (state === 'stale') {
    return (
      <span
        className={`inline-block rounded-full border-2 border-state-stale bg-transparent ${sizeClass} ${className}`}
        title="数据陈旧"
      />
    );
  }

  if (state === 'off') {
    return (
      <span
        className={`inline-block rounded-full bg-state-off opacity-60 ${sizeClass} ${className}`}
        title="离线"
      />
    );
  }

  const bgClass =
    state === 'crit'
      ? 'bg-state-crit'
      : state === 'warn'
        ? 'bg-state-warn'
        : 'bg-state-ok';

  return (
    <span
      className={`relative inline-flex items-center justify-center ${sizeClass} ${className}`}
    >
      {state === 'ok' && (
        <span
          className={`absolute inline-flex h-full w-full rounded-full ${bgClass} opacity-40 animate-ping`}
        />
      )}
      <span
        className={`relative inline-flex rounded-full ${sizeClass} ${bgClass}`}
      />
    </span>
  );
}
