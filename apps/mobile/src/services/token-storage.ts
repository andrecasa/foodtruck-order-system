import { Platform } from 'react-native';

/**
 * Token storage abstraction.
 * Uses AsyncStorage on native, localStorage on web.
 * Stores accessToken, refreshToken, and expiresAt timestamp.
 */

const KEYS = {
  ACCESS_TOKEN: '@order-system/access-token',
  REFRESH_TOKEN: '@order-system/refresh-token',
  EXPIRES_AT: '@order-system/expires-at',
} as const;

/**
 * Simple storage adapter that works on both web and native.
 * On native, falls back to a simple in-memory store if AsyncStorage is unavailable.
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

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    const expiresAt = await storage.getItem(KEYS.EXPIRES_AT);
    if (expiresAt && Date.now() > parseInt(expiresAt, 10)) {
      // Token expired
      await this.clear();
      return null;
    }
    return storage.getItem(KEYS.ACCESS_TOKEN);
  },

  async getRefreshToken(): Promise<string | null> {
    return storage.getItem(KEYS.REFRESH_TOKEN);
  },

  async setTokens(accessToken: string, refreshToken: string, expiresIn: number): Promise<void> {
    const expiresAt = Date.now() + expiresIn * 1000;
    await storage.setItem(KEYS.ACCESS_TOKEN, accessToken);
    await storage.setItem(KEYS.REFRESH_TOKEN, refreshToken);
    await storage.setItem(KEYS.EXPIRES_AT, expiresAt.toString());
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getAccessToken();
    return token !== null;
  },

  async clear(): Promise<void> {
    await storage.removeItem(KEYS.ACCESS_TOKEN);
    await storage.removeItem(KEYS.REFRESH_TOKEN);
    await storage.removeItem(KEYS.EXPIRES_AT);
  },
};
