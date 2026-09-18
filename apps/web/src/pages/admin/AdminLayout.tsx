import React from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import {
  Server,
  FolderTree,
  ShieldCheck,
  Sliders,
  BarChart3,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '../../i18n/index.js';

export function AdminLayout() {
  const { t } = useI18n();

  return (
    <div className="space-y-6 select-none">
      {/* Admin Secondary Top Navigation */}
      <div className="flex items-center justify-between border-b border-line-1 pb-3 overflow-x-auto">
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/admin"
            activeProps={{
              className: 'bg-accent text-bg-0 shadow-sm font-semibold',
            }}
            inactiveProps={{
              className: 'text-fg-2 hover:text-fg-1 hover:bg-bg-3/60',
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <Server className="w-3.5 h-3.5" />
            <span>{t('admin.serverList')}</span>
          </Link>

          <Link
            to="/admin/groups"
            activeProps={{
              className: 'bg-accent text-bg-0 shadow-sm font-semibold',
            }}
            inactiveProps={{
              className: 'text-fg-2 hover:text-fg-1 hover:bg-bg-3/60',
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{t('nav.groups')}</span>
          </Link>

          <Link
            to="/admin/security"
            activeProps={{
              className: 'bg-accent text-bg-0 shadow-sm font-semibold',
            }}
            inactiveProps={{
              className: 'text-fg-2 hover:text-fg-1 hover:bg-bg-3/60',
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('nav.security')}</span>
          </Link>

          <Link
            to="/admin/settings"
            activeProps={{
              className: 'bg-accent text-bg-0 shadow-sm font-semibold',
            }}
            inactiveProps={{
              className: 'text-fg-2 hover:text-fg-1 hover:bg-bg-3/60',
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('nav.settings')}</span>
          </Link>

          <Link
            to="/admin/usage"
            activeProps={{
              className: 'bg-accent text-bg-0 shadow-sm font-semibold',
            }}
            inactiveProps={{
              className: 'text-fg-2 hover:text-fg-1 hover:bg-bg-3/60',
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{t('nav.usage')}</span>
          </Link>
        </nav>

        <div className="hidden sm:flex items-center gap-2 text-xs text-fg-3">
          <Link to="/" className="hover:text-accent flex items-center gap-1">
            <span>回到前端总览</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Admin Content */}
      <Outlet />
    </div>
  );
}
