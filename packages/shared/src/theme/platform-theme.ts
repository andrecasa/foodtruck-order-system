import type { ThemeConfig } from '../types/theme';

/**
 * Neutral platform theme — the single source of truth shared by the backend
 * (Branding_Service / public branding) and the mobile app (default theme).
 *
 * This is the platform's own neutral, non-tenant-specific base theme. Both the
 * authenticated and public branding endpoints merge a tenant's partial `theme`
 * override on top of this base (via {@link deepMergeTheme}) so any token a
 * tenant does not provide falls back to a generic platform value, and the
 * operator and customer apps always render identical colors on the default
 * theme. It contains NO tenant name, brand or identifier.
 *
 * The full `ThemeConfig` is provided (not a partial) so the merged result is
 * always a complete, renderable theme even when a tenant supplies nothing.
 */
export const NEUTRAL_PLATFORM_THEME: ThemeConfig = {
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
 * Deep merges a partial theme override into a base `ThemeConfig`, handling up to
 * three levels of nesting (e.g. `colors.primary`, `typography.sizes.md`). Only
 * fields present in the override are applied; everything else keeps the base
 * (neutral platform) value.
 *
 * This is the single implementation used by both the server and the client, so
 * a given (base, override) pair always produces byte-identical results in the
 * operator and customer apps.
 */
export function deepMergeTheme(
  base: ThemeConfig,
  override: Partial<ThemeConfig> | null | undefined,
): ThemeConfig {
  const result = { ...base };
  if (!override) {
    return result;
  }

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
          mergedSection[subKey] = {
            ...(baseSubValue as Record<string, unknown>),
            ...(overrideSubValue as Record<string, unknown>),
          };
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
