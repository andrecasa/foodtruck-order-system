import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  /** Label text displayed in the badge */
  label: string;
  /** Badge color — used for text and background tint */
  color: string;
  /** Material Symbols icon glyph (optional) */
  icon?: string;
  /** Size variant: sm (22px) or md (28px) */
  size?: BadgeSize;
  /** Background opacity suffix — default '1F' (12%) */
  opacitySuffix?: string;
  /** Optional test ID */
  testID?: string;
}

/**
 * Badge — tinted pill with optional icon + label.
 *
 * Used for payment status, origin, and order status indicators.
 *
 * Specs (from design system):
 * - sm: height 22px, borderRadius 11px, paddingHorizontal 8px, fontSize 10px
 * - md: height 28px, borderRadius 14px, paddingHorizontal 12px, fontSize 11px
 * - icon: Material Symbols 12px, same color as text
 * - background: color + opacitySuffix (default '1F' = 12%)
 * - text: color (solid)
 */
export function Badge({
  label,
  color,
  icon,
  size = 'sm',
  opacitySuffix = '1F',
  testID,
}: BadgeProps) {
  const theme = useTheme();

  const isSm = size === 'sm';

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    backgroundColor: color + opacitySuffix,
    borderRadius: isSm ? 11 : 14,
    paddingHorizontal: isSm ? 8 : 12,
    height: isSm ? 22 : 28,
  };

  const iconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 12,
    color,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: isSm ? 10 : 11,
    fontWeight: '400',
    color,
  };

  return (
    <View style={containerStyle} testID={testID} accessibilityLabel={label}>
      {icon ? <RNText style={iconStyle}>{icon}</RNText> : null}
      <RNText style={labelStyle}>{label}</RNText>
    </View>
  );
}
