import React from 'react';
import { useTheme } from '../theme';

export type CardVariant = 'default' | 'aguardando' | 'preparando' | 'pronto';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Card component — pixel-perfect match to Penpot Design System.
 *
 * Penpot specs:
 * - background: gradient (transparent → 10% status color diagonal) + white base
 * - border-radius: 12px
 * - border: 1px solid <status-color> at 30% opacity (inner)
 * - padding: 16px
 * - gap: 12px (flex column)
 * - No shadow on status cards; default cards have subtle shadow
 */
export function Card({ children, variant = 'default', onClick, className, ariaLabel }: CardProps) {
  const theme = useTheme();

  const getStatusColor = (): string | null => {
    switch (variant) {
      case 'aguardando': return theme.colors.aguardando;
      case 'preparando': return theme.colors.preparando;
      case 'pronto': return theme.colors.pronto;
      default: return null;
    }
  };

  const statusColor = getStatusColor();

  // Convert hex color to rgba at given opacity
  const hexToRgba = (hex: string, opacity: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const borderColor = statusColor
    ? hexToRgba(statusColor, 0.3) // 30% opacity
    : '#E8DDD5'; // warm beige divider

  const background = statusColor
    ? `linear-gradient(135deg, rgba(255,255,255,0) 0%, ${hexToRgba(statusColor, 0.1)} 100%), #FFFFFF`
    : '#FFFFFF';

  const style: React.CSSProperties = {
    background,
    borderRadius: '12px',
    padding: '16px',
    border: `1px solid ${borderColor}`,
    boxShadow: variant === 'default' ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
    cursor: onClick ? 'pointer' : 'default',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    position: 'relative',
    overflow: 'hidden',
  };

  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        style={style}
        className={className}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }

  return <div style={style} className={className} aria-label={ariaLabel}>{children}</div>;
}
