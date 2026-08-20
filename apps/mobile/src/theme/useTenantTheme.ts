import { useEffect, useState } from 'react';
import type { ThemeConfig } from '@order-system/shared';
import { tokenStorage } from '../services/token-storage';
import { themeCache } from '../services/theme-cache';
import { defaultTheme, fetchTenantTheme } from './theme.config';

interface UseTenantThemeResult {
  /** The theme to apply. Starts neutral/cached, then resolves to the tenant theme. */
  theme: ThemeConfig;
  /** True until the tenant branding fetch has settled (success or fallback). */
  isResolving: boolean;
}

/**
 * Resolves the theme to apply based on authentication state.
 *
 * - While unauthenticated, applies the neutral platform theme (Requirement 11.6).
 * - After authentication, fetches the tenant branding from the backend and applies
 *   the tenant theme before authenticated screens render (Requirements 7.2, 7.4, 7.5).
 * - On fetch failure/timeout, keeps the neutral platform theme so the app stays
 *   usable (Requirement 7.8 / 11.7, Correctness Property 9).
 *
 * A locally cached theme is used for a fast start; the backend fetch always revalidates
 * on (re)authentication.
 *
 * @param isAuthenticated whether a tenant user is currently authenticated
 */
export function useTenantTheme(isAuthenticated: boolean): UseTenantThemeResult {
  const [theme, setTheme] = useState<ThemeConfig>(defaultTheme);
  const [isResolving, setIsResolving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      // Not authenticated → neutral platform branding, clear any cached tenant theme.
      setIsResolving(false);
      setTheme(defaultTheme);
      void themeCache.clear();
      return () => {
        cancelled = true;
      };
    }

    async function resolve() {
      setIsResolving(true);

      // Fast start: apply the last cached tenant theme (if any) while revalidating.
      const cached = await themeCache.load();
      if (!cancelled && cached) {
        setTheme(cached);
      }

      // Always revalidate against the backend; falls back to neutral on failure/timeout.
      const resolved = await fetchTenantTheme(() => tokenStorage.getAccessToken());
      if (!cancelled) {
        setTheme(resolved);
        setIsResolving(false);
      }
    }

    void resolve();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  return { theme, isResolving };
}
