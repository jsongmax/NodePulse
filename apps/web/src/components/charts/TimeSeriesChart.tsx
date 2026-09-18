import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface SeriesConfig {
  label: string;
  color: string; // token or hex
  fillColor?: string;
  width?: number;
}

export interface TimeSeriesChartProps {
  title?: string;
  data: [number[], ...number[][]]; // [timestamps, series1, series2...]
  series: SeriesConfig[];
  height?: number;
  yMin?: number;
  yMax?: number;
  unit?: '%' | 'bytes/s' | 'load';
  className?: string;
}

function formatValueWithUnit(val: number, unit?: string): string {
  if (val === null || val === undefined || isNaN(val)) return '-';
  if (unit === '%') return `${val.toFixed(1)}%`;
  if (unit === 'load') return val.toFixed(2);
  if (unit === 'bytes/s') {
    if (val >= 1024 * 1024 * 1024)
      return `${(val / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
    if (val >= 1024 * 1024) return `${(val / (1024 * 1024)).toFixed(1)} MB/s`;
    if (val >= 1024) return `${(val / 1024).toFixed(1)} KB/s`;
    return `${Math.round(val)} B/s`;
  }
  return val.toFixed(1);
}

export function TimeSeriesChart({
  title,
  data,
  series,
  height = 200,
  yMin = 0,
  yMax,
  unit = '%',
  className = '',
}: TimeSeriesChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;

    // Resolve CSS variables for canvas strokes
    const computedStyles = getComputedStyle(document.documentElement);
    const line1Color =
      computedStyles.getPropertyValue('--np-line-1').trim() ||
      'rgba(255,255,255,0.06)';
    const fg3Color =
      computedStyles.getPropertyValue('--np-fg-3').trim() || '#5B6B7C';
    const fg1Color =
      computedStyles.getPropertyValue('--np-fg-1').trim() || '#E8EEF5';

    const uPlotSeries: uPlot.Series[] = [
      {}, // 0: time series
      ...series.map((s) => {
        const stroke = s.color.startsWith('var(')
          ? computedStyles
              .getPropertyValue(s.color.replace(/var\(|\)/g, ''))
              .trim() || '#38BDF8'
          : s.color;

        let fill: string | undefined = s.fillColor;
        if (!fill && s.color) {
          fill = `${stroke}1f`; // ~12% opacity
        }

        return {
          label: s.label,
          stroke,
          width: s.width ?? 1.5,
          fill,
          points: {
            show: false,
          },
        };
      }),
    ];

    const opts: uPlot.Options = {
      width,
      height,
      cursor: {
        drag: { x: false, y: false },
        points: {
          size: 6,
          fill: () => fg1Color,
          stroke: () => line1Color,
          width: 2,
        },
      },
      scales: {
        x: {
          time: true,
        },
        y: {
          auto: yMax === undefined,
          range: [yMin, yMax ?? 100],
        },
      },
      axes: [
        {
          stroke: fg3Color,
          grid: {
            stroke: line1Color,
            width: 1,
          },
          ticks: {
            stroke: line1Color,
            width: 1,
          },
          font: '10px JetBrains Mono, monospace',
        },
        {
          stroke: fg3Color,
          grid: {
            stroke: line1Color,
            width: 1,
          },
          ticks: {
            stroke: line1Color,
            width: 1,
          },
          font: '10px JetBrains Mono, monospace',
          values: (_u, vals) => vals.map((v) => formatValueWithUnit(v, unit)),
        },
      ],
      series: uPlotSeries,
    };

    // Instantiate uPlot
    container.innerHTML = '';
    const u = new uPlot(opts, data as uPlot.AlignedData, container);
    plotRef.current = u;

    // Observe container width resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0 && plotRef.current) {
          plotRef.current.setSize({
            width: entry.contentRect.width,
            height,
          });
        }
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (plotRef.current) {
        plotRef.current.destroy();
        plotRef.current = null;
      }
    };
  }, [series, height, yMin, yMax, unit]);

  // Update data when data changes
  useEffect(() => {
    if (plotRef.current && data) {
      plotRef.current.setData(data as uPlot.AlignedData);
    }
  }, [data]);

  return (
    <div className={`w-full overflow-hidden select-none ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-fg-2 uppercase tracking-wider">
            {title}
          </span>
          <span className="text-xs font-mono text-fg-1">
            {data[1] && data[1].length > 0
              ? formatValueWithUnit(data[1][data[1].length - 1]!, unit)
              : '-'}
          </span>
        </div>
      )}
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
