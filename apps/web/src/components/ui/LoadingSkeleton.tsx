import React from 'react';

export function LoadingSkeleton({
  count = 6,
  className = '',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 ${className}`}
    >
      {Array.from({ length: count }, (_, idx) => (
        <div
          key={idx}
          className="p-4 rounded-xl bg-bg-1 border border-line-1 space-y-4 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-bg-3" />
              <div className="w-28 h-4 rounded bg-bg-3" />
            </div>
            <div className="w-12 h-3 rounded bg-bg-3" />
          </div>

          <div className="grid grid-cols-3 gap-2 py-2">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-4 border-bg-3" />
              <div className="w-8 h-2 rounded bg-bg-3" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-4 border-bg-3" />
              <div className="w-8 h-2 rounded bg-bg-3" />
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-full border-4 border-bg-3" />
              <div className="w-8 h-2 rounded bg-bg-3" />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-line-1">
            <div className="w-20 h-3 rounded bg-bg-3" />
            <div className="w-16 h-5 rounded bg-bg-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
