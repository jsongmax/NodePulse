import React, { useState } from 'react';
import { Copy, Check, Terminal } from 'lucide-react';

export interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeBlock({ code, className = '' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <div
      className={`relative rounded-xl bg-bg-0 border border-line-1 overflow-hidden select-text ${className}`}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-2/70 border-b border-line-1 text-[11px] font-mono text-fg-3">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5 text-accent" />
          <span>bash</span>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-bg-3 text-fg-2 hover:text-fg-1 transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-state-ok" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>复制命令</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 font-mono text-xs text-fg-1 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
        {code}
      </pre>
    </div>
  );
}
