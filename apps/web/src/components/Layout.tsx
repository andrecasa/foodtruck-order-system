import React from 'react';
import { useTheme } from '../theme';

// ─── Screen ─────────────────────────────────────────────────────────────────

export interface ScreenProps {
  children: React.ReactNode;
  /** Applies padding using theme.spacing.md. Defaults to true. */
  padding?: boolean;
}

/**
 * Full-screen container with min-height:100vh and theme background color.
 */
export function Screen({ children, padding = true }: ScreenProps) {
  const theme = useTheme();

  const style: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: theme.colors.background,
    position: 'relative',
    overflow: 'hidden',
    ...(padding && { padding: `${theme.spacing.md}px` }),
  };

  return <div style={style}>{children}</div>;
}
