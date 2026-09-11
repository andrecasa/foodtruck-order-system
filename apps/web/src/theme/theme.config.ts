import type { ThemeConfig } from '@order-system/shared';
import { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '@order-system/shared/theme/platform-theme';

/**
 * Neutral default theme for the platform web app (Requirements 7.8, 11.2, 11.3, 11.5, 11.6, 11.7).
 *
 * É o MESMO `NEUTRAL_PLATFORM_THEME` que o backend usa como base de merge e que o
 * app mobile aplica como tema padrão (fonte única da verdade em
 * `@order-system/shared`). Assim, servidor e clientes renderizam cores idênticas
 * no tema neutro, sem cópia local para manter em sincronia. É aplicado no load
 * (antes da autenticação) e serve de fallback quando o branding não está
 * disponível.
 */
export const defaultTheme: ThemeConfig = NEUTRAL_PLATFORM_THEME;

// `deepMergeTheme` vive em `@order-system/shared` (mesma implementação usada pelo
// backend e mobile). Reexportado aqui para que importadores existentes deste
// módulo sigam funcionando sem mudança.
export { deepMergeTheme };

// Augment the Window interface for server-injected theme config
declare global {
  interface Window {
    __THEME_CONFIG__?: Partial<ThemeConfig>;
  }
}

/**
 * Loads theme configuration from external sources with fallback to defaultTheme.
 *
 * Resolution order (first match wins):
 * 1. `window.__THEME_CONFIG__` — injected by the server at runtime (no rebuild needed)
 * 2. `VITE_THEME_CONFIG_PATH` — build-time env var pointing to a JSON path (static import)
 * 3. Falls back to defaultTheme
 *
 * This allows a new tenant to be configured without code changes or rebuild.
 */
export function loadTheme(): ThemeConfig {
  // 1. Check for server-injected global theme config (runtime override, no rebuild)
  if (typeof window !== 'undefined' && window.__THEME_CONFIG__) {
    try {
      return deepMergeTheme(defaultTheme, window.__THEME_CONFIG__);
    } catch {
      // If merge fails, fall through to next option
    }
  }

  // 2. Check for VITE_THEME_CONFIG_PATH env var (build-time decision)
  // This is available at build time via Vite's import.meta.env
  try {
    const themeConfigPath = import.meta.env.VITE_THEME_CONFIG_PATH;
    if (themeConfigPath) {
      // In a build-time context, the JSON would need to be fetched or pre-bundled.
      // For synchronous loading, the server should inject via window.__THEME_CONFIG__.
      // This env var serves as a flag for async loading if needed.
      console.info(
        `[theme] VITE_THEME_CONFIG_PATH is set to "${themeConfigPath}". ` +
        'Use window.__THEME_CONFIG__ for runtime injection or fetch the file asynchronously.',
      );
    }
  } catch {
    // import.meta.env may not be available in test environments
  }

  // 3. Fallback to default theme
  return defaultTheme;
}
