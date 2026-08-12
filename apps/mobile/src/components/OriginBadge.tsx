import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
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
  testID?: string;
}

/**
 * Origin badge — tinted pill indicating order source (full card width).
 * Pixel-perfect match to Penpot Design System.
 *
 * Penpot specs:
 * - height: 22px, borderRadius: 11px
 * - horizontalSizing: fill (stretches to full card width)
 * - fontSize: 10, fontWeight: 500, textAlign: center
 * - Presencial: bg #F5EDE8, text #7B2D2D
 * - WhatsApp: bg #F0F5EE, text #5A8C5A
 */
export function OriginBadge({ origin, testID }: OriginBadgeProps) {
  const theme = useTheme();

  const isWhatsApp = origin === 'whatsapp';

  const containerStyle: ViewStyle = {
    backgroundColor: isWhatsApp ? BADGE_BG_WHATSAPP : BADGE_BG_PRESENCIAL,
    borderRadius: 11,
    height: 22,
    paddingHorizontal: 12,
    alignSelf: 'stretch', // Penpot: horizontalSizing "fill" — full card width
    justifyContent: 'center',
    alignItems: 'center',
  };

  const textStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: '500',
    color: isWhatsApp ? BADGE_TEXT_WHATSAPP : BADGE_TEXT_PRESENCIAL,
  };

  const label = isWhatsApp ? 'WhatsApp' : 'Presencial';

  return (
    <View style={containerStyle} testID={testID}>
      <Text style={textStyle} accessibilityLabel={`Origem: ${label}`}>
        {label}
      </Text>
    </View>
  );
}
