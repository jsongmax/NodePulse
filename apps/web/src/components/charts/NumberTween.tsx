import React, { useEffect, useState } from 'react';

export interface NumberTweenProps {
  value: number;
  decimals?: number;
  duration?: number; // ms, default 600ms per tokens.json
  prefix?: string;
  suffix?: string;
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function NumberTween({
  value,
  decimals = 1,
  duration = 600,
  prefix = '',
  suffix = '',
  className = '',
}: NumberTweenProps) {
  const [displayValue, setDisplayValue] = useState<number>(value);

  useEffect(() => {
    // Respect reduced motion preference
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplayValue(value);
      return;
    }

    const startValue = displayValue;
    const endValue = isNaN(value) ? 0 : value;
    const diff = endValue - startValue;

    if (diff === 0) return;

    let startTime: number | null = null;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);

      const current = startValue + diff * eased;
      setDisplayValue(current);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        setDisplayValue(endValue);
      }
    };

    animationFrame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [value, duration]);

  const formatted =
    decimals > 0
      ? displayValue.toFixed(decimals)
      : Math.round(displayValue).toString();

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
