import React, { createContext, useContext, useMemo } from 'react';
import type { ThemeConfig } from '@order-system/shared';
import { loadTheme } from './theme.config';

const ThemeContext = createContext<ThemeConfig | null>(null);

interface ThemeProviderProps {
  children: React.ReactNode;
  /** Optional theme override. If provided, skips loadTheme() and uses this value. */
  theme?: ThemeConfig;
}

/**
 * Provides ThemeConfig to all descendants via React Context.
 *
 * The theme is resolved synchronously (loadTheme() returns a ThemeConfig directly),
 * so children always render with the theme already available — satisfying Requirement 1.6
 * (global application before rendering).
 */
export function ThemeProvider({ children, theme }: ThemeProviderProps) {
  const resolvedTheme = useMemo(() => theme ?? loadTheme(), [theme]);

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
