import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
} from '@tanstack/react-router';
import { Activity, Shield, LayoutGrid, Monitor } from 'lucide-react';

// Root layout
const rootRoute = createRootRoute({
  component: () => (
    <div className="min-h-screen flex flex-col bg-bg-0 text-fg-1">
      <header className="h-14 border-b border-line-1 px-6 flex items-center justify-between bg-bg-1/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-6 h-6">
            <div className="absolute w-6 h-6 rounded-full border border-accent opacity-30 animate-ping" />
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
          </div>
          <Link to="/" className="font-semibold text-lg tracking-tight">
            Node<span className="text-accent">Pulse</span>
          </Link>
        </div>
        <nav className="flex items-center gap-4 text-sm text-fg-2">
          <Link
            to="/"
            className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
          >
            <LayoutGrid className="w-4 h-4" />
            <span>总览</span>
          </Link>
          <Link
            to="/wall"
            className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
          >
            <Monitor className="w-4 h-4" />
            <span>大屏</span>
          </Link>
          <Link
            to="/login"
            className="flex items-center gap-1.5 hover:text-fg-1 transition-colors"
          >
            <Shield className="w-4 h-4" />
            <span>登录</span>
          </Link>
        </nav>
      </header>
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
      <footer className="py-4 border-t border-line-1 text-center text-xs text-fg-3">
        NodePulse · Observatory Monitoring System
      </footer>
    </div>
  ),
});

// Index page
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">节点监控</h1>
          <p className="text-sm text-fg-2 mt-1">实时上报与轻量化状态感知</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-state-ok/15 text-state-ok border border-state-ok/20">
            <span className="w-1.5 h-1.5 rounded-full bg-state-ok animate-pulse" />
            系统就绪 (M3)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl bg-bg-1 border border-line-1 space-y-2">
          <div className="text-xs uppercase font-medium text-fg-2 tracking-wider">
            Hub 核心状态
          </div>
          <div className="text-xl font-mono font-semibold text-fg-1">
            Worker + DO
          </div>
          <div className="text-xs text-fg-3">本地 Miniflare 模拟运行中</div>
        </div>

        <div className="p-5 rounded-xl bg-bg-1 border border-line-1 space-y-2">
          <div className="text-xs uppercase font-medium text-fg-2 tracking-wider">
            Web 前端技术栈
          </div>
          <div className="text-xl font-mono font-semibold text-accent">
            React 19 + Tailwind v4
          </div>
          <div className="text-xs text-fg-3">
            TanStack Router · Zustand · uPlot
          </div>
        </div>

        <div className="p-5 rounded-xl bg-bg-1 border border-line-1 space-y-2">
          <div className="text-xs uppercase font-medium text-fg-2 tracking-wider">
            Agent 通道协议
          </div>
          <div className="text-xl font-mono font-semibold text-state-ok">
            WebSocket v1
          </div>
          <div className="text-xs text-fg-3">Go 独立模块 · 严格 Zod 校验</div>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-bg-1 border border-line-1 text-center space-y-3">
        <Activity className="w-8 h-8 text-accent mx-auto opacity-80" />
        <h2 className="text-base font-medium">设计令牌与主题系统已生效</h2>
        <p className="text-sm text-fg-2 max-w-md mx-auto">
          M3 任务 1 完成：Tailwind v4 @theme
          变量映射、自托管字体、深/浅色模式切换、i18n 框架及 ESLint
          无硬编码色值门禁均已生效。
        </p>
      </div>
    </div>
  ),
});

// Login page
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => (
    <div className="max-w-md mx-auto mt-16 p-8 rounded-2xl bg-bg-1 border border-line-1 space-y-6 text-center">
      <div className="w-12 h-12 rounded-full bg-accent-soft border border-accent/20 flex items-center justify-center mx-auto text-accent">
        <Shield className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-xl font-bold">管理员登录</h2>
        <p className="text-xs text-fg-3 mt-1">
          此面板不使用密码，仅支持 Passkey
        </p>
      </div>
      <button
        type="button"
        disabled
        className="w-full py-2.5 px-4 rounded-lg bg-accent text-bg-0 font-medium text-sm opacity-50 cursor-not-allowed"
      >
        使用通行密钥登录
      </button>
    </div>
  ),
});

// Wall page
const wallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wall',
  component: () => (
    <div className="p-8 rounded-xl bg-bg-1 border border-line-1 text-center space-y-4">
      <Monitor className="w-10 h-10 text-accent mx-auto" />
      <h2 className="text-xl font-bold">天文台大屏 (/wall)</h2>
      <p className="text-sm text-fg-2">
        Pulse Map 点阵地图与全景态势大屏将在 M5 完整实现。
      </p>
    </div>
  ),
});

// Setup page
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: () => (
    <div className="max-w-md mx-auto mt-16 p-8 rounded-2xl bg-bg-1 border border-line-1 space-y-4">
      <h2 className="text-xl font-bold">初始化向导</h2>
      <p className="text-sm text-fg-2">
        Passkey 注册向导即将在 M3-T3 完整呈现。
      </p>
    </div>
  ),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  wallRoute,
  setupRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
