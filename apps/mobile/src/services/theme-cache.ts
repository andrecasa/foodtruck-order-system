import { Platform } from 'react-native';
import type { ThemeConfig } from '@order-system/shared';

/**
 * Local cache for the last applied tenant theme.
 *
 * Persisting the resolved tenant theme lets the app start with the tenant's
 * branding immediately on the next launch (fast start), while the fresh branding
 * is re-fetched from the backend after login. Mirrors the storage abstraction used
 * by `token-storage` (AsyncStorage/localStorage on web, in-memory fallback on native).
 */

const THEME_CACHE_KEY = '@order-system/tenant-theme';

/**
 * Simple storage adapter that works on both web and native.
 * On native, falls back to a simple in-memory store if persistent storage is unavailable.
 */
/** Subconjunto mínimo do `localStorage` do browser usado por este módulo. */
interface WebStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const storage = (() => {
  const globalWithStorage = globalThis as unknown as { localStorage?: WebStorage };
  if (Platform.OS === 'web' && typeof globalThis !== 'undefined' && globalWithStorage.localStorage) {
    const ls = globalWithStorage.localStorage;
    return {
      getItem: (key: string): Promise<string | null> => Promise.resolve(ls.getItem(key)),
      setItem: (key: string, value: string): Promise<void> => {
        ls.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string): Promise<void> => {
        ls.removeItem(key);
        return Promise.resolve();
      },
    };
  }

  // In-memory fallback for native (replace with AsyncStorage when available)
  const memStore: Record<string, string> = {};
  return {
    getItem: (key: string): Promise<string | null> => Promise.resolve(memStore[key] ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      memStore[key] = value;
      return Promise.resolve();
    },
    removeItem: (key: string): Promise<void> => {
      delete memStore[key];
      return Promise.resolve();
    },
  };
})();

/** Minimal structural check that a parsed value looks like a ThemeConfig. */
function isThemeConfig(value: unknown): value is ThemeConfig {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.businessName === 'string' &&
    typeof t.colors === 'object' && t.colors !== null &&
    typeof t.typography === 'object' && t.typography !== null &&
    typeof t.spacing === 'object' && t.spacing !== null &&
    typeof t.borderRadius === 'object' && t.borderRadius !== null
  );
}

export const themeCache = {
  /** Persists the resolved theme. Best-effort; never throws. */
  async save(theme: ThemeConfig): Promise<void> {
    try {
      await storage.setItem(THEME_CACHE_KEY, JSON.stringify(theme));
    } catch {
      // Ignore cache write failures.
    }
  },

  /** Returns the cached theme, or null when absent/invalid. Never throws. */
  async load(): Promise<ThemeConfig | null> {
    try {
      const raw = await storage.getItem(THEME_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isThemeConfig(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  /** Clears the cached theme (e.g., on logout). Never throws. */
  async clear(): Promise<void> {
    try {
      await storage.removeItem(THEME_CACHE_KEY);
    } catch {
      // Ignore.
    }
  },
};
