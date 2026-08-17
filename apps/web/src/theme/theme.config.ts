import type { ThemeConfig } from '@order-system/shared';

/**
 * Default theme configuration for the Pastel das Meninas food truck web app.
 *
 * Brand-aligned design system:
 * - Font: Inter (loaded via Google Fonts)
 * - Icons: Material Symbols Outlined
 * - Primary: Burgundy (#7B2D2D) — brand identity
 * - Secondary: Amber (#D4812B) — warm accent
 * - Surface: White, Background: #FDF8F4 (cream)
 * - Pill-shaped inputs (border-radius: 24px)
 * - Pill buttons (border-radius: 20px)
 * - Stroke: always 1px, 30% opacity
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
    // Order status: entregue (delivered) — warm brown
    entregue: '#8B6B5A',
    // Secondary text — muted warm brown
    textSecondary: '#8B6B5A',
    // Card/surface background
    surface: '#FFFFFF',
    // Border/separator — warm beige
    divider: '#E8DDD5',
    // Financial: received amount — dark green
    received: '#5A8C5A',
    // Financial: pending amount — dark red
    pending: '#B54040',
    // Financial: revenue/faturamento — amber
    revenue: '#D4812B',
    // Sub-card tinted background: primary tint
    surfacePrimary: '#F5EDE8',
    // Sub-card tinted background: revenue/amber tint
    surfaceRevenue: '#FDF5EA',
    // Sub-card tinted background: received/green tint
    surfaceReceived: '#F0F5EE',
    // Sub-card tinted background: pending/red tint
    surfacePending: '#FDF0F0',
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
