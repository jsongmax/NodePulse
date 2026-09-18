import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
  theme: ThemeMode;
  resolvedTheme: 'dark' | 'light';
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
}

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyTheme(resolved: 'dark' | 'light') {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
  if (resolved === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
  } else {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const storedTheme =
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem('np_theme') as ThemeMode)
      : null) ?? 'dark';

  const resolved = storedTheme === 'system' ? getSystemTheme() : storedTheme;
  applyTheme(resolved);

  if (typeof window !== 'undefined') {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', () => {
      if (get().theme === 'system') {
        const sys = getSystemTheme();
        applyTheme(sys);
        set({ resolvedTheme: sys });
      }
    });
  }

  return {
    theme: storedTheme,
    resolvedTheme: resolved,
    setTheme: (mode: ThemeMode) => {
      const activeResolved = mode === 'system' ? getSystemTheme() : mode;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('np_theme', mode);
      }
      applyTheme(activeResolved);
      set({ theme: mode, resolvedTheme: activeResolved });
    },
    toggleTheme: () => {
      const current = get().resolvedTheme;
      const next = current === 'dark' ? 'light' : 'dark';
      get().setTheme(next);
    },
  };
});
