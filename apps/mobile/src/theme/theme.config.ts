import type { ThemeConfig, TenantBrandingResponse } from '@order-system/shared';
import { themeCache } from '../services/theme-cache';

/**
 * Neutral platform default theme for the white-label mobile app.
 *
 * This theme contains NO tenant-specific branding (no "Pastel das Meninas",
 * no burgundy brand colors). It is a generic, brand-agnostic design system used:
 * - Before login / while no tenant is authenticated.
 * - As a safe fallback when tenant branding cannot be fetched (Requirement 7.8, 11.7).
 *
 * Real per-tenant branding (businessName, logo, colors) is resolved at runtime from
 * the backend after login via `fetchTenantTheme`, without requiring a new build
 * (Requirements 7.4, 7.5, 11.1, 11.5).
 *
 * WCAG AA compliance (neutral palette):
 * - Text (#1F2933) on Background (#F5F7FA): high contrast (~13:1)
 * - Primary (#2C6E9B) on white: contrast ratio ~4.6:1
 */
export const defaultTheme: ThemeConfig = {
  businessName: 'Food Truck App',
  logo: '',
  colors: {
    // Neutral platform primary — desaturated blue
    primary: '#2C6E9B',
    // Neutral platform secondary — slate
    secondary: '#5A6B7B',
    // Light neutral background
    background: '#F5F7FA',
    // Dark neutral text
    text: '#1F2933',
    // Status: success/pronto — neutral green
    success: '#3E8E5A',
    // Status: warning/aguardando — neutral amber
    warning: '#B8860B',
    // Error — neutral red
    error: '#B23A3A',
    // Order status: aguardando (waiting) — neutral amber
    aguardando: '#B8860B',
    // Order status: preparando (preparing) — neutral blue
    preparando: '#3B6EA5',
    // Order status: pronto (ready) — neutral green
    pronto: '#3E8E5A',
    // Order status: entregue (delivered) — neutral gray
    entregue: '#6B7280',
    // Secondary text — muted gray
    textSecondary: '#6B7280',
    // Card/surface background
    surface: '#FFFFFF',
    // Thin separator/divider line — light gray
    divider: '#E2E8F0',
    // Default outline/border for inputs, cards, chips
    border: '#E2E8F0',
    // Background of disabled controls
    surfaceDisabled: '#E2E8F0',
    // Text/icon color for disabled or inactive content
    textDisabled: '#9AA5B1',
    // Financial: received — neutral green
    received: '#2E7D32',
    // Financial: pending — neutral red
    pending: '#C62828',
    // Financial: faturamento — neutral blue
    revenue: '#2C6E9B',
    // Sub-card backgrounds (tinted, neutral)
    surfacePrimary: '#EEF3F7',
    surfaceRevenue: '#EEF3F7',
    surfaceReceived: '#EEF6EF',
    surfacePending: '#FBEEEE',
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
