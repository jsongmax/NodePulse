import React, { useEffect, useRef } from 'react';

export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string; // CSS variable or token, e.g. 'var(--color-metric-cpu)'
  min?: number;
  max?: number;
  className?: string;
}

export function Sparkline({
  data,
  width = 96,
  height = 24,
  color = 'var(--color-metric-cpu)',
  min,
  max,
  className = '',
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    if (!data || data.length < 2) return;

    const resolvedMin = min ?? Math.min(...data);
    const resolvedMax = max ?? Math.max(...data);
    const range = resolvedMax - resolvedMin || 1;

    // Resolve computed color from CSS variable if needed
    const computedColor = color.startsWith('var(')
      ? getComputedStyle(document.documentElement)
          .getPropertyValue(color.replace(/var\(|\)/g, ''))
          .trim() || '#38BDF8'
      : color;

    const points: [number, number][] = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * (width - 4) + 2;
      const normalized = (val - resolvedMin) / range;
      const y = height - 2 - normalized * (height - 6);
      return [x, y];
    });

    // 1. Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${computedColor}33`); // ~20% opacity
    gradient.addColorStop(1, `${computedColor}00`); // 0% opacity

    ctx.beginPath();
    ctx.moveTo(points[0]![0], height);
    for (const [px, py] of points) {
      ctx.lineTo(px, py);
    }
    ctx.lineTo(points[points.length - 1]![0], height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // 2. Draw line
    ctx.beginPath();
    ctx.moveTo(points[0]![0], points[0]![1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i]![0], points[i]![1]);
    }
    ctx.strokeStyle = computedColor;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 3. Draw highlighted last point per FRONTEND-DESIGN §4
    const lastPoint = points[points.length - 1]!;
    ctx.beginPath();
    ctx.arc(lastPoint[0], lastPoint[1], 2.5, 0, Math.PI * 2);
    ctx.fillStyle = computedColor;
    ctx.fill();
  }, [data, width, height, color, min, max]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={`block select-none ${className}`}
    />
  );
}
