import React from 'react';
import { Link } from '@tanstack/react-router';
import {
  LayoutGrid,
  Monitor,
  Shield,
  Sun,
  Moon,
  Globe,
  Settings,
} from 'lucide-react';
import { useServerStore } from '../../store/serverStore.js';
import { useThemeStore } from '../../theme/theme.js';
import { useI18n } from '../../i18n/index.js';

export function Header() {
  const connectionStatus = useServerStore((s) => s.connectionStatus);
  const { resolvedTheme, toggleTheme } = useThemeStore();
  const { locale, setLocale, t } = useI18n();

  return (
    <header className="h-14 border-b border-line-1 px-4 sm:px-6 flex items-center justify-between bg-bg-1/80 backdrop-blur sticky top-0 z-30 select-none">
      {/* 1. Brand */}
      <div className="flex items-center gap-3">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative flex items-center justify-center w-6 h-6">
            <div className="absolute w-6 h-6 rounded-full border border-accent opacity-30 group-hover:animate-ping" />
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
          </div>
          <span className="font-semibold text-base tracking-tight text-fg-1">
            Node<span className="text-accent">Pulse</span>
          </span>
        </Link>

        {/* Live indicator dot */}
        <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-line-1 text-xs">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-state-ok animate-pulse'
                : 'bg-state-warn'
            }`}
          />
          <span className="text-[11px] font-mono text-fg-2 uppercase">
            {connectionStatus === 'connected' ? 'Live' : connectionStatus}
          </span>
        </div>
      </div>

      {/* 2. Navigation */}
      <nav className="flex items-center gap-3 sm:gap-5 text-xs sm:text-sm text-fg-2 font-medium">
        <Link
          to="/"
          activeProps={{ className: 'text-accent font-semibold' }}
          className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.overview')}</span>
        </Link>
        <Link
          to="/wall"
          activeProps={{ className: 'text-accent font-semibold' }}
          className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
        >
          <Monitor className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.wall')}</span>
        </Link>
        <Link
          to="/admin"
          activeProps={{ className: 'text-accent font-semibold' }}
          className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.admin')}</span>
        </Link>
        <Link
          to="/login"
          activeProps={{ className: 'text-accent font-semibold' }}
          className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
        >
          <Shield className="w-4 h-4" />
          <span className="hidden sm:inline">{t('nav.login')}</span>
        </Link>
      </nav>

      {/* 3. Controls (Theme & i18n) */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Language switch */}
        <button
          type="button"
          onClick={() => setLocale(locale === 'zh-CN' ? 'en' : 'zh-CN')}
          className="p-1.5 rounded-lg text-fg-2 hover:text-fg-1 hover:bg-bg-3/60 transition-colors flex items-center gap-1 text-xs font-mono cursor-pointer"
          title="切换语言 / Switch Language"
          aria-label="Toggle language"
        >
          <Globe className="w-4 h-4" />
          <span className="hidden sm:inline text-[11px] uppercase">
            {locale === 'zh-CN' ? '中' : 'EN'}
          </span>
        </button>

        {/* Theme switch */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-fg-2 hover:text-fg-1 hover:bg-bg-3/60 transition-colors cursor-pointer"
          title={resolvedTheme === 'dark' ? '切换浅色模式' : '切换深色模式'}
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="w-4 h-4 text-accent" />
          ) : (
            <Moon className="w-4 h-4 text-fg-1" />
          )}
        </button>
      </div>
    </header>
  );
}
