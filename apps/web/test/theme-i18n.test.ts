import { describe, expect, it } from 'vitest';
import { useThemeStore } from '../src/theme/theme.js';
import { useI18nStore } from '../src/i18n/index.js';

describe('Design Tokens, Theme & i18n System', () => {
  it('toggles theme between dark and light', () => {
    const store = useThemeStore.getState();
    store.setTheme('dark');
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');

    store.toggleTheme();
    expect(useThemeStore.getState().resolvedTheme).toBe('light');

    store.toggleTheme();
    expect(useThemeStore.getState().resolvedTheme).toBe('dark');
  });

  it('translates keys for zh-CN and en locales', () => {
    const i18n = useI18nStore.getState();
    i18n.setLocale('zh-CN');
    expect(i18n.t('common.online')).toBe('在线');
    expect(i18n.t('nav.overview')).toBe('总览');

    i18n.setLocale('en');
    expect(i18n.t('common.online')).toBe('Online');
    expect(i18n.t('nav.overview')).toBe('Overview');
  });
});
