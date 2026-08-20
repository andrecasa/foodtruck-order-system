import React, { createContext, useContext, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import type { ThemeConfig } from '@order-system/shared';
import { loadTheme, defaultTheme } from './theme.config';

interface ThemeContextValue {
  theme: ThemeConfig;
  /** Replaces the active theme (e.g. with the tenant branding fetched after login). */
  setTheme: (theme: ThemeConfig) => void;
  /** Resets the active theme back to the neutral platform default. */
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Optional initial theme override. If provided, skips loadTheme() and uses this value. */
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
  root.setProperty('--color-border', theme.colors.border);
  root.setProperty('--color-surface-disabled', theme.colors.surfaceDisabled);
  root.setProperty('--color-text-disabled', theme.colors.textDisabled);

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
 * The neutral platform theme is applied synchronously on mount (before the user
 * authenticates), satisfying Requirement 11.6 (neutral branding within 1s of load)
 * and R7.8/R11.7 (neutral fallback). After a successful login, the auth flow calls
 * `setTheme()` with the tenant branding fetched from the backend, which re-applies
 * the CSS variables before the authenticated screens paint (R7.2).
 *
 * CSS variables are applied synchronously via useLayoutEffect to guarantee they
 * exist before any child component paints.
 */
export function ThemeProvider({ children, theme }: ThemeProviderProps) {
  const initialTheme = useMemo(() => theme ?? loadTheme(), [theme]);
  const [activeTheme, setActiveTheme] = useState<ThemeConfig>(initialTheme);

  const setTheme = useCallback((next: ThemeConfig) => {
    setActiveTheme(next);
  }, []);

  const resetTheme = useCallback(() => {
    setActiveTheme(defaultTheme);
  }, []);

  // useLayoutEffect runs synchronously after DOM mutations but before the browser paints,
  // ensuring CSS variables are set before children are visually rendered.
  useLayoutEffect(() => {
    applyCSSVariables(activeTheme);
  }, [activeTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: activeTheme, setTheme, resetTheme }),
    [activeTheme, setTheme, resetTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook to access the current ThemeConfig.
 * Must be used within a ThemeProvider.
 *
 * @throws Error if called outside of a ThemeProvider.
 */
export function useTheme(): ThemeConfig {
  const ctx = useContext(ThemeContext);

  if (ctx === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return ctx.theme;
}

/**
 * Hook to access theme mutation actions (apply tenant branding / reset to neutral).
 * Must be used within a ThemeProvider.
 *
 * @throws Error if called outside of a ThemeProvider.
 */
export function useThemeActions(): Pick<ThemeContextValue, 'setTheme' | 'resetTheme'> {
  const ctx = useContext(ThemeContext);

  if (ctx === null) {
    throw new Error('useThemeActions must be used within a ThemeProvider');
  }

  return { setTheme: ctx.setTheme, resetTheme: ctx.resetTheme };
}
