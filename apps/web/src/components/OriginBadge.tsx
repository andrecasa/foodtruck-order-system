import React from 'react';
import { useTheme } from '../theme/ThemeProvider';
import {
  BADGE_BG_PRESENCIAL,
  BADGE_BG_WHATSAPP,
  BADGE_TEXT_PRESENCIAL,
  BADGE_TEXT_WHATSAPP,
} from '@order-system/shared';

export type BadgeOrigin = 'presencial' | 'whatsapp';

export interface OriginBadgeProps {
  origin: BadgeOrigin;
}

/**
 * Origin badge — tinted pill indicating order source.
 * Pixel-perfect match to Penpot Design System.
 *
 * Penpot specs:
 * - height: 22px, borderRadius: 11px
 * - fontSize: 10, fontWeight: 500
 * - Presencial: bg #F5EDE8, text #7B2D2D
 * - WhatsApp: bg #F0F5EE, text #5A8C5A
 */
export function OriginBadge({ origin }: OriginBadgeProps) {
  const theme = useTheme();

  const isWhatsApp = origin === 'whatsapp';

  const label = isWhatsApp ? 'WhatsApp' : 'Presencial';

  const style: React.CSSProperties = {
    backgroundColor: isWhatsApp ? BADGE_BG_WHATSAPP : BADGE_BG_PRESENCIAL,
    color: isWhatsApp ? BADGE_TEXT_WHATSAPP : BADGE_TEXT_PRESENCIAL,
    borderRadius: '11px',
    height: '22px',
    paddingLeft: '12px',
    paddingRight: '12px',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '10px',
    fontWeight: 500,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <span aria-label={`Origem: ${label}`} style={style}>
      {label}
    </span>
  );
}
