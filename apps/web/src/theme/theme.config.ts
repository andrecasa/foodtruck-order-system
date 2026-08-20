import type { ThemeConfig } from '@order-system/shared';

/**
 * Neutral default theme for the platform web app (Requirements 7.8, 11.2, 11.3, 11.5, 11.6, 11.7).
 *
 * This is the platform's own neutral, non-tenant-specific base theme. It contains
 * NO tenant name, brand or identifier. It is applied instantly on load (before the
 * user authenticates) and serves as the fallback when tenant branding cannot be
 * fetched. After login, the tenant's branding (fetched from the backend) is merged
 * over this neutral base via `deepMergeTheme`.
 *
 * Neutral design system:
 * - Font: Inter (loaded via Google Fonts)
 * - Icons: Material Symbols Outlined
 * - Primary: neutral blue-gray (#3B5568) — platform default, no brand identity
 * - High-contrast neutral surfaces for WCAG AA readability
 *
 * Kept in sync with the backend `NEUTRAL_PLATFORM_THEME` so server and client
 * produce identical merges.
 */
export const defaultTheme: ThemeConfig = {
  businessName: 'Food Truck App',
  logo: '',
  colors: {
    // Neutral blue-gray primary — platform default, no brand identity
    primary: '#3B5568',
    secondary: '#6B7B8C',
    background: '#F5F6F7',
    text: '#1F2937',
    success: '#3E8E5A',
    warning: '#C08A2E',
    error: '#B03A3A',
    aguardando: '#C08A2E',
    preparando: '#3B6EA5',
    pronto: '#3E8E5A',
    entregue: '#6B7280',
    textSecondary: '#6B7280',
    surface: '#FFFFFF',
    divider: '#E2E5E9',
    border: '#E2E5E9',
    surfaceDisabled: '#E2E5E9',
    textDisabled: '#9AA1AB',
    received: '#3E8E5A',
    pending: '#B03A3A',
    revenue: '#C08A2E',
    surfacePrimary: '#EDF0F3',
    surfaceRevenue: '#F7F1E6',
    surfaceReceived: '#EDF5EF',
    surfacePending: '#F7ECEC',
  },
  typography: {
    fontFamily: 'Inter',
    sizes: {
      xs: 10,
      sm: 12,
      md: 14,
      lg: 16,
      xl: 20,
      xxl: 32,
    },
    weights: {
      regular: 400,
      medium: 500,
      bold: 600,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 24,
    full: 9999,
  },
};

/**
 * Deep merges a partial theme override into a base ThemeConfig.
 * Handles up to 2 levels of nesting (e.g., colors.primary, typography.sizes.md).
 * Only overrides fields that are present in the override object.
 */
export function deepMergeTheme(
  base: ThemeConfig,
  override: Partial<ThemeConfig>,
): ThemeConfig {
  const result = { ...base };

  for (const key of Object.keys(override) as Array<keyof ThemeConfig>) {
    const baseValue = base[key];
    const overrideValue = override[key];

    if (
      overrideValue !== undefined &&
      overrideValue !== null &&
      typeof baseValue === 'object' &&
      typeof overrideValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      // Second level merge (e.g., colors, typography, spacing, borderRadius)
      const mergedSection: Record<string, unknown> = { ...(baseValue as Record<string, unknown>) };
      for (const subKey of Object.keys(overrideValue as Record<string, unknown>)) {
        const baseSubValue = (baseValue as Record<string, unknown>)[subKey];
        const overrideSubValue = (overrideValue as Record<string, unknown>)[subKey];

        if (
          overrideSubValue !== undefined &&
          overrideSubValue !== null &&
          typeof baseSubValue === 'object' &&
          typeof overrideSubValue === 'object' &&
          !Array.isArray(baseSubValue)
        ) {
          // Third level merge (e.g., typography.sizes, typography.weights)
          mergedSection[subKey] = { ...(baseSubValue as Record<string, unknown>), ...(overrideSubValue as Record<string, unknown>) };
        } else if (overrideSubValue !== undefined) {
          mergedSection[subKey] = overrideSubValue;
        }
      }
      (result as Record<string, unknown>)[key] = mergedSection;
    } else if (overrideValue !== undefined) {
      (result as Record<string, unknown>)[key] = overrideValue;
    }
  }

  return result;
}

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

/** Shape of the branding payload returned by GET /api/tenant/branding. */
interface TenantBrandingResponse {
  businessName: string;
  logoUrl: string | null;
  theme: Partial<ThemeConfig>;
}

/**
 * Fetches the authenticated tenant's branding from the backend and merges its
 * partial `theme` override on top of the neutral platform theme.
 *
 * Requirements: 7.2, 7.3, 7.7, 7.8, 11.3, 11.5, 11.7.
 *
 * The businessName and logo returned by the tenant are folded into the resulting
 * ThemeConfig so downstream consumers see the tenant's branding. Any token the
 * tenant does not provide falls back to the neutral platform value.
 *
 * On any failure (network error, non-2xx status, malformed body, or timeout) this
 * resolves to the neutral `defaultTheme` so the app stays usable (R7.8, R11.7).
 *
 * @param token   Bearer access token for the authenticated request.
 * @param options apiUrl base and timeout (ms) overrides (defaults: env / 2000ms).
 */
export async function fetchTenantBranding(
  token: string,
  options: { apiUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ThemeConfig> {
  const apiUrl =
    options.apiUrl ??
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined) ??
    'http://localhost:4000';
  const timeoutMs = options.timeoutMs ?? 2000;
  const doFetch = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(`${apiUrl}/api/tenant/branding`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      return defaultTheme;
    }

    const data = (await res.json()) as TenantBrandingResponse;

    // Fold tenant businessName/logo into the theme override before merging so
    // the merged ThemeConfig carries the tenant's identity (R11.3).
    const override: Partial<ThemeConfig> = { ...(data.theme ?? {}) };
    if (typeof data.businessName === 'string' && data.businessName.length > 0) {
      override.businessName = data.businessName;
    }
    if (typeof data.logoUrl === 'string' && data.logoUrl.length > 0) {
      override.logo = data.logoUrl;
    }

    return deepMergeTheme(defaultTheme, override);
  } catch {
    // Network error, abort/timeout, or malformed body → neutral fallback (R7.8, R11.7).
    return defaultTheme;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches the authenticated tenant's id from GET /api/tenant/branding.
 *
 * The front-end needs the tenant id to subscribe only to its own tenant's
 * realtime channels (`orders:queue:{tenantId}` / `orders:payment:{tenantId}` —
 * R12.7, R12.9). This is a small, separate helper so `fetchTenantBranding`
 * (theme application) stays focused on the theme.
 *
 * On any failure (network error, non-2xx, malformed body, timeout) resolves to
 * `null`; callers fall back to not subscribing to any tenant channel.
 */
export async function fetchTenantId(
  token: string,
  options: { apiUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | null> {
  const apiUrl =
    options.apiUrl ??
    (typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined) ??
    'http://localhost:4000';
  const timeoutMs = options.timeoutMs ?? 2000;
  const doFetch = options.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(`${apiUrl}/api/tenant/branding`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tenantId?: unknown };
    return typeof data.tenantId === 'string' && data.tenantId.length > 0 ? data.tenantId : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
