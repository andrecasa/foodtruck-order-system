import React from 'react';
import { useTheme } from '../theme/ThemeProvider';

export type BadgeStatus = 'aguardando' | 'preparando' | 'pronto' | 'entregue' | 'pago' | 'pendente';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  status: BadgeStatus;
  size?: BadgeSize;
}

/**
 * Badge component — pixel-perfect match to Penpot Design System.
 *
 * Penpot specs:
 * - border-radius: 14px (md) / 11px (sm)
 * - height: 28px (md) / 22px (sm)
 * - padding: 0 12px
 * - font: Inter 11px (md) / 10px (sm) weight 400
 * - No text-transform uppercase
 * - Status badges (aguardando, preparando, pronto): tinted bg (12% opacity) with status color text
 * - Tinted badges (entregue, pago, pendente): light bg with colored text
 */
export function Badge({ status, size = 'md' }: BadgeProps) {
  const theme = useTheme();

  const getBackgroundColor = (): string => {
    switch (status) {
      case 'aguardando': return theme.colors.aguardando + '1F'; // 12% opacity
      case 'preparando': return theme.colors.preparando + '1F'; // 12% opacity
      case 'pronto': return theme.colors.pronto + '1F'; // 12% opacity
      case 'entregue': return '#8B6B5A' + '1F'; // 12% opacity
      case 'pago': return '#F0F5EE';
      case 'pendente': return '#FDF5EA';
    }
  };

  const getTextColor = (): string => {
    switch (status) {
      case 'aguardando': return theme.colors.aguardando;
      case 'preparando': return theme.colors.preparando;
      case 'pronto': return theme.colors.pronto;
      case 'entregue': return '#8B6B5A';
      case 'pago': return '#7B2D2D';
      case 'pendente': return '#D4812B';
    }
  };

  const height = size === 'sm' ? '22px' : '28px';
  const fontSize = size === 'sm' ? '10px' : '11px';
  const borderRadius = size === 'sm' ? '11px' : '14px';

  /** Capitalize first letter for display */
  const displayText = status.charAt(0).toUpperCase() + status.slice(1);

  const style: React.CSSProperties = {
    backgroundColor: getBackgroundColor(),
    color: getTextColor(),
    borderRadius,
    height,
    paddingLeft: '12px',
    paddingRight: '12px',
    fontFamily: '"Inter", -apple-system, sans-serif',
    fontSize,
    fontWeight: 400,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    whiteSpace: 'nowrap',
  };

  return (
    <span role="status" aria-label={`Status: ${status}`} style={style}>
      {displayText}
    </span>
  );
}
