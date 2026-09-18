import React from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { Header } from './components/ui/Header.js';
import { DisconnectedBanner } from './components/ui/DisconnectedBanner.js';
import { useHubSocket } from './hooks/useHubSocket.js';
import { OverviewPage } from './pages/OverviewPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { SetupPage } from './pages/SetupPage.js';
import { ServerDetailPage } from './pages/ServerDetailPage.js';
import { Monitor } from 'lucide-react';

function RootComponent() {
  useHubSocket();

  return (
    <div className="min-h-screen flex flex-col bg-bg-0 text-fg-1">
      <DisconnectedBanner />
      <Header />
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        <Outlet />
      </main>
      <footer className="py-4 border-t border-line-1 text-center text-xs text-fg-3 select-none">
        NodePulse · Observatory Telemetry Platform
      </footer>
    </div>
  );
}

// Root layout
const rootRoute = createRootRoute({
  component: RootComponent,
});

// Index route: /
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewPage,
});

// Login route: /login
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

// Setup route: /setup
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
});

// Server detail route: /server/:id
const serverDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/server/$id',
  component: ServerDetailPage,
});

// Wall route: /wall (reserved for M5 per instructions)
const wallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wall',
  component: () => (
    <div className="p-8 rounded-2xl bg-bg-1 border border-line-1 text-center space-y-4 max-w-lg mx-auto mt-12 surface-glass select-none">
      <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mx-auto">
        <Monitor className="w-6 h-6" />
      </div>
      <h2 className="text-xl font-bold text-fg-1">天文台大屏 (/wall)</h2>
      <p className="text-sm text-fg-2 leading-relaxed">
        大屏模式与 Pulse Map 点阵世界地图属于 M5 里程碑。M3
        阶段专注总览面板、详情页、后台控制台与认证流程。
      </p>
    </div>
  ),
});

// Admin placeholder route (will be fully implemented in M3-T5)
const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: () => <Outlet />,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  setupRoute,
  serverDetailRoute,
  wallRoute,
  adminRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
