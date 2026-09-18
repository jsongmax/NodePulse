import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

export interface TokenRevealProps {
  token: string;
  autoHideSeconds?: number;
  className?: string;
}

export function TokenReveal({
  token,
  autoHideSeconds = 30,
  className = '',
}: TokenRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [remaining, setRemaining] = useState(autoHideSeconds);

  useEffect(() => {
    if (!revealed) return;

    setRemaining(autoHideSeconds);
    const interval = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setRevealed(false);
          clearInterval(interval);
          return autoHideSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [revealed, autoHideSeconds]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <div
      className={`p-4 rounded-xl bg-bg-2 border border-line-2 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between text-xs text-fg-3">
        <span className="font-semibold text-state-warn">
          重要：该访问凭证仅显示一次，离开后无法再次查看！
        </span>
        {revealed && (
          <span className="font-mono text-fg-2 text-[11px]">
            {remaining}s 后自动隐藏
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 p-2.5 rounded-lg bg-bg-0 border border-line-1 font-mono text-xs text-fg-1 break-all select-all flex items-center justify-between">
          <span
            className={revealed ? '' : 'blur-sm select-none transition-all'}
          >
            {revealed
              ? token
              : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
          </span>
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            className="p-1 rounded text-fg-3 hover:text-fg-1 transition-colors cursor-pointer ml-2 shrink-0"
            title={revealed ? '隐藏' : '显示'}
          >
            {revealed ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="p-2.5 rounded-lg bg-bg-3 hover:bg-accent hover:text-bg-0 text-fg-1 transition-all cursor-pointer shrink-0 flex items-center gap-1 text-xs font-medium"
          title="复制令牌"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-state-ok" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
