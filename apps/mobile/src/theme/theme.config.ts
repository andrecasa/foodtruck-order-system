import type { ThemeConfig, TenantBrandingResponse } from '@order-system/shared';
import { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '@order-system/shared/theme/platform-theme';
import { themeCache } from '../services/theme-cache';

/**
 * Neutral platform default theme for the white-label mobile app.
 *
 * This theme contains NO tenant-specific branding. It is a generic,
 * brand-agnostic design system used:
 * - Before login / while no tenant is authenticated.
 * - As a safe fallback when tenant branding cannot be fetched (Requirement 7.8, 11.7).
 *
 * Real per-tenant branding (businessName, logo, colors) is resolved at runtime from
 * the backend after login via `fetchTenantTheme`, without requiring a new build
 * (Requirements 7.4, 7.5, 11.1, 11.5).
 *
 * It is the SAME `NEUTRAL_PLATFORM_THEME` the backend merges tenant overrides
 * over (single source of truth in `@order-system/shared`), so the operator and
 * customer apps render identical colors on the default theme.
 */
export const defaultTheme: ThemeConfig = NEUTRAL_PLATFORM_THEME;

// `deepMergeTheme` now lives in `@order-system/shared` (single source of truth
// shared with the backend). Re-exported here so existing importers of it from
// this module keep working unchanged.
export { deepMergeTheme };

/**
 * Builds the applied ThemeConfig for a tenant branding response by merging the
 * tenant's partial theme (and businessName/logo) over the neutral platform theme.
 */
export function applyBranding(branding: TenantBrandingResponse): ThemeConfig {
  const merged = deepMergeTheme(defaultTheme, branding.theme ?? {});
  return {
    ...merged,
    businessName: branding.businessName || merged.businessName,
    logo: branding.logoUrl ?? merged.logo,
    // Public slug for building the ordering URL (operator Home QR). Absent when
    // the tenant has none; the neutral fallback theme leaves this undefined.
    slug: branding.slug ?? merged.slug,
  };
}

/**
 * Synchronously returns the theme to use before any tenant branding is fetched.
 *
 * This always returns the neutral platform theme, so the app can render immediately
 * (before login and while the async branding request is in flight). Per-tenant
 * branding is applied afterwards via `loadTenantTheme` / `fetchTenantTheme`.
 */
export function loadTheme(): ThemeConfig {
  return defaultTheme;
}

/** Default timeout for the branding fetch (Requirement 7.7: backend responds within 2s). */
const BRANDING_FETCH_TIMEOUT_MS = 2000;

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Fetches the authenticated tenant's branding from the backend and returns the
 * fully-resolved ThemeConfig (tenant branding merged over the neutral platform theme).
 *
 * On failure or timeout, resolves to the neutral platform `defaultTheme` and the app
 * remains usable (Requirement 7.8 / 11.7, Correctness Property 9). On success, the
 * resolved theme is cached locally for a fast start on the next launch.
 *
 * @param getAccessToken function returning the current access token (or null)
 */
export async function fetchTenantTheme(
  getAccessToken: () => Promise<string | null>,
  timeoutMs: number = BRANDING_FETCH_TIMEOUT_MS,
): Promise<ThemeConfig> {
  try {
    const token = await getAccessToken();
    if (!token) {
      return defaultTheme;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/tenant/branding`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return defaultTheme;
    }

    const branding = (await response.json()) as TenantBrandingResponse;
    if (!branding || typeof branding.businessName !== 'string') {
      return defaultTheme;
    }

    const theme = applyBranding(branding);
    // Cache the resolved theme for a fast start next launch (best-effort).
    await themeCache.save(theme);
    return theme;
  } catch {
    // Network error, timeout/abort, or malformed response → neutral fallback.
    return defaultTheme;
  }
}

/**
 * Fetches the authenticated tenant's id from GET /api/tenant/branding.
 *
 * The app needs the tenant id to subscribe only to its own tenant's realtime
 * channels (`orders:queue:{tenantId}` / `orders:payment:{tenantId}` — R12.7,
 * R12.9). Kept as a small, separate helper so `fetchTenantTheme` stays focused
 * on the theme. Resolves to `null` on any failure/timeout; callers then avoid
 * subscribing to any tenant channel.
 *
 * @param getAccessToken function returning the current access token (or null)
 */
export async function fetchTenantId(
  getAccessToken: () => Promise<string | null>,
  timeoutMs: number = BRANDING_FETCH_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const token = await getAccessToken();
    if (!token) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/tenant/branding`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) return null;
    const data = (await response.json()) as { tenantId?: unknown };
    return typeof data.tenantId === 'string' && data.tenantId.length > 0 ? data.tenantId : null;
  } catch {
    return null;
  }
}

/**
 * Returns the last cached tenant theme for a fast start, or the neutral platform
 * theme when no valid cache exists. Never throws.
 */
export async function loadCachedTheme(): Promise<ThemeConfig> {
  try {
    const cached = await themeCache.load();
    return cached ?? defaultTheme;
  } catch {
    return defaultTheme;
  }
}
