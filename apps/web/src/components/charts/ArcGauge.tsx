import React from 'react';

export interface ArcGaugeProps {
  value: number; // 0 - 100
  label?: string;
  size?: 56 | 72 | 120;
  metric?: 'cpu' | 'mem' | 'disk' | 'swap';
  showPercentage?: boolean;
}

export function ArcGauge({
  value,
  label,
  size = 56,
  metric = 'cpu',
  showPercentage = true,
}: ArcGaugeProps) {
  const clampedValue = Math.min(100, Math.max(0, isNaN(value) ? 0 : value));

  // Determine state color based on threshold (> 90% crit, > 80% warn, otherwise metric color)
  let strokeColor = `var(--color-metric-${metric})`;
  if (clampedValue >= 90) {
    strokeColor = 'var(--color-state-crit)';
  } else if (clampedValue >= 80) {
    strokeColor = 'var(--color-state-warn)';
  }

  const strokeWidth = size >= 120 ? 8 : size >= 72 ? 6 : 4.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // 270 degree arc = 0.75 of circumference
  const arcLength = 0.75 * circumference;
  const progressOffset = arcLength * (1 - clampedValue / 100);

  const fontSize =
    size >= 120 ? 'text-2xl' : size >= 72 ? 'text-base' : 'text-xs';
  const labelSize = size >= 120 ? 'text-xs' : 'text-[10px]';

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          width={size}
          height={size}
          className="transform rotate-[135deg]"
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-line-2)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={progressOffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>

        {/* Center Value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={`font-mono font-semibold tabular-nums text-fg-1 ${fontSize}`}
          >
            {Math.round(clampedValue)}
            {showPercentage && (
              <span className="text-[9px] font-normal text-fg-3 ml-0.5">%</span>
            )}
          </span>
        </div>
      </div>

      {label && (
        <span
          className={`mt-1 font-medium text-fg-2 uppercase tracking-wider ${labelSize}`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
