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

// ─── Header ─────────────────────────────────────────────────────────────────

export interface HeaderProps {
  children?: React.ReactNode;
  /** Optional title displayed on the left side of the header. */
  title?: string;
  /** Optional Material Symbols Outlined icon name rendered before the title. */
  icon?: string;
  /** Optional element rendered on the right side of the header. */
  rightElement?: React.ReactNode;
}

/**
 * Top bar / page header using a semantic header element.
 * Pixel-perfect match to Penpot AppBar:
 * - bg: #FFFFFF
 * - shadow: 0 1px 3px rgba(0,0,0,0.06)
 * - padding: 0 24px (web uses 24px per Penpot web spec)
 * - height: 56px
 * - gap: 12px, align-items: center
 * - icon: Material Symbols Outlined 24px, color #7B2D2D (primary)
 * - title: 18px weight 500, Inter, color #3D2020
 */
export function Header({ children, title, icon, rightElement }: HeaderProps) {
  const theme = useTheme();

  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    height: '56px',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };

  const leftStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '12px',
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: '"Material Symbols Outlined"',
    fontSize: '24px',
    fontWeight: 400,
    color: theme.colors.primary,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 500,
    color: '#3D2020',
    margin: 0,
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
  };

  return (
    <header style={style}>
      {title ? (
        <div style={leftStyle}>
          {icon && <span style={iconStyle}>{icon}</span>}
          <h1 style={titleStyle}>{title}</h1>
        </div>
      ) : (
        <div style={leftStyle}>{children}</div>
      )}
      {rightElement && <div>{rightElement}</div>}
    </header>
  );
}

// ─── ScrollContainer ────────────────────────────────────────────────────────

export interface ScrollContainerProps {
  children: React.ReactNode;
  /** Applies padding using theme.spacing.md. Defaults to true. */
  padding?: boolean;
  className?: string;
}

/**
 * Scrollable content area using overflow-y:auto with theme-based spacing.
 */
export function ScrollContainer({ children, padding = true, className }: ScrollContainerProps) {
  const theme = useTheme();

  const style: React.CSSProperties = {
    overflowY: 'auto',
    flex: 1,
    ...(padding && { padding: `${theme.spacing.md}px` }),
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}

// ─── Grid ───────────────────────────────────────────────────────────────────

export interface GridProps {
  children: React.ReactNode;
  /** Number of columns. Defaults to 2. */
  columns?: number;
  /** Gap between items in px. Uses theme.spacing.md if not specified. */
  gap?: number;
  className?: string;
}

/**
 * CSS Grid-based layout component.
 * Uses display:grid with configurable columns and gap from theme tokens.
 */
export function Grid({ children, columns = 2, gap, className }: GridProps) {
  const theme = useTheme();
  const resolvedGap = gap ?? theme.spacing.md;

  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: `${resolvedGap}px`,
  };

  return (
    <div style={style} className={className}>
      {children}
    </div>
  );
}
