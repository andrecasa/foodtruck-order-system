import type { ThemeConfig } from '@order-system/shared';

/**
 * Default theme configuration for the Pastel das Meninas food truck app.
 *
 * Brand-aligned design system:
 * - Font: Inter
 * - Icons: Material Symbols Outlined
 * - Primary: Burgundy (#7B2D2D) — brand identity
 * - Secondary: Amber (#D4812B) — warm accent
 * - Surface: White, Background: #FDF8F4 (cream)
 * - Pill-shaped inputs (border-radius: 24px)
 * - Pill buttons (border-radius: 20px)
 * - Card strokes at 30% opacity
 * - Stroke: always 1px
 *
 * WCAG AA compliance:
 * - Text (#3D2020) on Background (#FDF8F4): contrast ratio ~12:1
 * - Primary (#7B2D2D) on white: contrast ratio ~7.5:1
 */
export const defaultTheme: ThemeConfig = {
  businessName: 'Pastel das Meninas',
  logo: '',
  colors: {
    // Burgundy/maroon primary — brand identity
    primary: '#7B2D2D',
    // Warm orange/amber — accent
    secondary: '#D4812B',
    // Warm cream background
    background: '#FDF8F4',
    // Dark warm brown text for readability
    text: '#3D2020',
    // Status: success/pronto — sage green
    success: '#5A8C5A',
    // Status: warning/aguardando — amber
    warning: '#D4812B',
    // Error — muted warm red
    error: '#B54040',
    // Order status: aguardando (waiting) — amber
    aguardando: '#D4812B',
    // Order status: preparando (preparing) — steel blue
    preparando: '#5B8BA8',
    // Order status: pronto (ready) — sage green
    pronto: '#5A8C5A',
    // Secondary text — muted warm brown
    textSecondary: '#8B6B5A',
    // Card/surface background
    surface: '#FFFFFF',
    // Border/separator — warm beige
    divider: '#E8DDD5',
    // Financial: received — dark green
    received: '#2E7D32',
    // Financial: pending — dark red
    pending: '#C62828',
    // Financial: faturamento — amber (same as secondary)
    revenue: '#D4812B',
    // Sub-card backgrounds (tinted)
    surfacePrimary: '#FDF8F4',
    surfaceRevenue: '#FFF8F0',
    surfaceReceived: '#F0F8F0',
    surfacePending: '#FEF2F2',
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
 * Loads theme configuration from external sources with fallback to defaultTheme.
 *
 * Resolution order (first match wins):
 * 1. `EXPO_PUBLIC_THEME_CONFIG` env var — a JSON string with partial theme overrides
 * 2. Falls back to defaultTheme
 *
 * This allows a new tenant to be configured without code changes or rebuild
 * by setting the env var before starting the Expo dev server or building the app.
 */
export function loadTheme(): ThemeConfig {
  // TODO: Support EXPO_PUBLIC_THEME_CONFIG env var when expo/virtual/env resolution is fixed
  return defaultTheme;
}
