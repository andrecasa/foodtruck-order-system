import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type BadgeStatus = 'aguardando' | 'preparando' | 'pronto' | 'entregue' | 'pago' | 'pendente';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  /** The status to display */
  status: BadgeStatus;
  /** Size variant */
  size?: BadgeSize;
  /** Optional test ID for testing */
  testID?: string;
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
 * - Tinted badges (pago/pendente): light bg with colored text
 */
export function Badge({ status, size = 'md', testID }: BadgeProps) {
  const theme = useTheme();

  const getBackgroundColor = (): string => {
    switch (status) {
      case 'aguardando':
        return theme.colors.aguardando + '1F'; // 12% opacity
      case 'preparando':
        return theme.colors.preparando + '1F'; // 12% opacity
      case 'pronto':
        return theme.colors.pronto + '1F'; // 12% opacity
      case 'entregue':
        return theme.colors.textSecondary + '1F'; // 12% opacity
      case 'pago':
        return theme.colors.success + '1F'; // 12% opacity
      case 'pendente':
        return theme.colors.secondary + '1F'; // 12% opacity
    }
  };

  const getTextColor = (): string => {
    switch (status) {
      case 'aguardando':
        return theme.colors.aguardando;
      case 'preparando':
        return theme.colors.preparando;
      case 'pronto':
        return theme.colors.pronto;
      case 'entregue':
        return theme.colors.textSecondary;
      case 'pago':
        return theme.colors.primary;
      case 'pendente':
        return theme.colors.secondary;
    }
  };

  const fontSize = size === 'sm' ? 10 : 11;
  const height = size === 'sm' ? 22 : 28;
  const borderRadius = size === 'sm' ? 11 : 14;

  const bgColor = getBackgroundColor();
  const textColor = getTextColor();

  const containerStyle: ViewStyle = {
    backgroundColor: bgColor,
    borderRadius,
    height,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  };

  const textStyle: TextStyle = {
    color: textColor,
    fontFamily: theme.typography.fontFamily,
    fontSize,
    fontWeight: '400', // Penpot: always 400 for all badge sizes
  };

  /** Capitalize first letter for display */
  const displayText = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <View
      style={containerStyle}
      accessibilityRole="text"
      accessibilityLabel={`Status: ${status}`}
      testID={testID}
    >
      <Text style={textStyle}>{displayText}</Text>
    </View>
  );
}
