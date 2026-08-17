import React from 'react';
import { useTheme } from '../theme';

export interface PrototypeBannerProps {
  /** Position variant: 'login' for screens without Header, 'default' for screens with Header */
  variant?: 'login' | 'default';
}

/**
 * Prototype indicator — diagonal ribbon in the top-right corner.
 * Pixel-perfect match to Penpot "Prototype Ribbon":
 * - Board 111×18px, rotated 45°, absolute positioned near top-right
 * - Fill: #D4812B (secondary), opacity 0.92, borderRadius 0
 * - Text: "PROTÓTIPO", Inter 9px, weight 600, letterSpacing 1px, white
 * - Parent clips content (overflow hidden)
 *
 * Positioning:
 * - 'default' (pages with Header): clip top=56px (below Header), ribbon top=23, left=-8
 * - 'login' (no Header): clip top=0, ribbon top=23, left=-8
 */
export function PrototypeBanner({ variant = 'default' }: PrototypeBannerProps) {
  const theme = useTheme();

  const isPrototypeMode = import.meta.env.VITE_PROTOTYPE_MODE === 'true';

  if (!isPrototypeMode) {
    return null;
  }

  const clipTop = variant === 'login' ? '0px' : '56px';

  const clipStyle: React.CSSProperties = {
    position: 'absolute',
    top: clipTop,
    right: '0px',
    width: '80px',
    height: '80px',
    overflow: 'hidden',
    zIndex: 100,
    pointerEvents: 'none',
  };

  const ribbonStyle: React.CSSProperties = {
    position: 'absolute',
    top: '23px',
    left: '-8px',
    width: '111px',
    height: '18px',
    backgroundColor: theme.colors.secondary, // #D4812B
    opacity: 0.92,
    transform: 'rotate(45deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const textStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '9px',
    fontWeight: 600,
    color: theme.colors.surface,
    letterSpacing: '1px',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  };

  return (
    <div style={clipStyle} aria-hidden="true">
      <div style={ribbonStyle} role="banner" aria-label="Modo Protótipo ativo">
        <span style={textStyle}>PROTÓTIPO</span>
      </div>
    </div>
  );
}
