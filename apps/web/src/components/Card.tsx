import React from 'react';
import { useTheme } from '../theme';

export type CardVariant = 'default' | 'aguardando' | 'preparando' | 'pronto' | 'entregue';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Card component — pixel-perfect match to Penpot mobile card design.
 *
 * Uses theme colors for the status sidebar strip.
 * - Layout: row (sidebar strip 5px + content area)
 * - Sidebar strip: 5px wide, status color, borderRadius TL/BL 14px
 * - Content area: padding 12px, gap 10px, flex column
 * - Width: 300px fixed
 */
export function Card({ children, variant = 'default', onClick, className, ariaLabel }: CardProps) {
  const theme = useTheme();

  const getStatusColor = (): string => {
    switch (variant) {
      case 'aguardando': return theme.colors.aguardando;
      case 'preparando': return theme.colors.preparando;
      case 'pronto': return theme.colors.pronto;
      case 'entregue': return theme.colors.entregue;
      default: return theme.colors.divider;
    }
  };

  const statusColor = getStatusColor();

  const cardStyle: React.CSSProperties = {
    background: theme.colors.surface,
    borderRadius: '14px',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    flex: '1 1 250px',
    maxWidth: '300px',
    minWidth: '250px',
    cursor: onClick ? 'pointer' : 'default',
    boxSizing: 'border-box',
  };

  const sidebarStyle: React.CSSProperties = {
    width: '5px',
    minWidth: '5px',
    backgroundColor: statusColor,
    borderTopLeftRadius: '14px',
    borderBottomLeftRadius: '14px',
    flexShrink: 0,
    alignSelf: 'stretch',
  };

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    flex: 1,
    minWidth: 0,
  };

  const element = (
    <div style={cardStyle} className={className} aria-label={ariaLabel}>
      <div style={sidebarStyle} aria-hidden="true" />
      <div style={contentStyle}>
        {children}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      >
        {element}
      </div>
    );
  }

  return element;
}
