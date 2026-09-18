import { create } from 'zustand';
import { zhCN } from './locales/zh-CN.js';
import { en } from './locales/en.js';

export type Locale = 'zh-CN' | 'en';

const translations = {
  'zh-CN': zhCN,
  en,
};

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type TranslationKey = NestedKeyOf<typeof zhCN>;

interface I18nState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

function resolvePath(obj: unknown, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const p of parts) {
    if (current && typeof current === 'object' && p in current) {
      current = (current as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof current === 'string' ? current : path;
}

export const useI18nStore = create<I18nState>((set, get) => {
  const storedLocale =
    (typeof localStorage !== 'undefined'
      ? (localStorage.getItem('np_locale') as Locale)
      : null) ?? 'zh-CN';

  if (typeof document !== 'undefined') {
    document.documentElement.lang = storedLocale;
  }

  return {
    locale: storedLocale,
    setLocale: (locale: Locale) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('np_locale', locale);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
      }
      set({ locale });
    },
    t: (key: string) => {
      const current = translations[get().locale] ?? zhCN;
      return resolvePath(current, key);
    },
  };
});

export function useI18n() {
  const { locale, setLocale, t } = useI18nStore();
  return { locale, setLocale, t };
}
