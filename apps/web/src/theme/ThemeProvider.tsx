import React, { createContext, useContext, useLayoutEffect, useMemo } from 'react';
import type { ThemeConfig } from '@order-system/shared';
import { loadTheme } from './theme.config';

const ThemeContext = createContext<ThemeConfig | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Optional theme override. If provided, skips loadTheme() and uses this value. */
  theme?: ThemeConfig;
}

/**
 * Maps all ThemeConfig tokens to CSS custom properties on document.documentElement.
 * This ensures components can reference theme values via standard CSS (e.g., var(--color-primary)).
 */
function applyCSSVariables(theme: ThemeConfig): void {
  const root = document.documentElement.style;

  // Colors
  root.setProperty('--color-primary', theme.colors.primary);
  root.setProperty('--color-secondary', theme.colors.secondary);
  root.setProperty('--color-background', theme.colors.background);
  root.setProperty('--color-text', theme.colors.text);
  root.setProperty('--color-success', theme.colors.success);
  root.setProperty('--color-warning', theme.colors.warning);
  root.setProperty('--color-error', theme.colors.error);
  root.setProperty('--color-aguardando', theme.colors.aguardando);
  root.setProperty('--color-preparando', theme.colors.preparando);
  root.setProperty('--color-pronto', theme.colors.pronto);
  root.setProperty('--color-entregue', theme.colors.entregue);
  root.setProperty('--color-text-secondary', theme.colors.textSecondary);
  root.setProperty('--color-surface', theme.colors.surface);
  root.setProperty('--color-divider', theme.colors.divider);

  // Typography
  root.setProperty('--font-family', theme.typography.fontFamily);
  root.setProperty('--font-size-xs', `${theme.typography.sizes.xs}px`);
  root.setProperty('--font-size-sm', `${theme.typography.sizes.sm}px`);
  root.setProperty('--font-size-md', `${theme.typography.sizes.md}px`);
  root.setProperty('--font-size-lg', `${theme.typography.sizes.lg}px`);
  root.setProperty('--font-size-xl', `${theme.typography.sizes.xl}px`);
  root.setProperty('--font-size-xxl', `${theme.typography.sizes.xxl}px`);
  root.setProperty('--font-weight-regular', String(theme.typography.weights.regular));
  root.setProperty('--font-weight-medium', String(theme.typography.weights.medium));
  root.setProperty('--font-weight-bold', String(theme.typography.weights.bold));

  // Spacing
  root.setProperty('--spacing-xs', `${theme.spacing.xs}px`);
  root.setProperty('--spacing-sm', `${theme.spacing.sm}px`);
  root.setProperty('--spacing-md', `${theme.spacing.md}px`);
  root.setProperty('--spacing-lg', `${theme.spacing.lg}px`);
  root.setProperty('--spacing-xl', `${theme.spacing.xl}px`);

  // Border radius
  root.setProperty('--radius-sm', `${theme.borderRadius.sm}px`);
  root.setProperty('--radius-md', `${theme.borderRadius.md}px`);
  root.setProperty('--radius-lg', `${theme.borderRadius.lg}px`);
  root.setProperty('--radius-full', `${theme.borderRadius.full}px`);
}

/**
 * Provides ThemeConfig to all descendants via React Context and sets CSS custom
 * properties on document.documentElement.
 *
 * CSS variables are applied synchronously via useLayoutEffect to guarantee they
 * exist before any child component paints — satisfying Requirement 1.6
 * (global application before rendering).
 */
export function ThemeProvider({ children, theme }: ThemeProviderProps) {
  const resolvedTheme = useMemo(() => theme ?? loadTheme(), [theme]);

  // useLayoutEffect runs synchronously after DOM mutations but before the browser paints,
  // ensuring CSS variables are set before children are visually rendered.
  useLayoutEffect(() => {
    applyCSSVariables(resolvedTheme);
  }, [resolvedTheme]);

  return (
    <ThemeContext.Provider value={resolvedTheme}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access the current ThemeConfig.
 * Must be used within a ThemeProvider.
 *
 * @throws Error if called outside of a ThemeProvider.
 */
export function useTheme(): ThemeConfig {
  const theme = useContext(ThemeContext);

  if (theme === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return theme;
}
