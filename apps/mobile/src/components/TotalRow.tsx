import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { formatPrice } from '../utils/format';
import { withOpacity } from '../utils/color';

export interface TotalRowProps {
  /** Total amount in centavos. */
  totalCents: number;
  /** Label on the left. Defaults to "Total". */
  label?: string;
  testID?: string;
}

/**
 * Total row — the single source of truth for the "Total" bar used by the
 * operator's Novo Pedido (CreateOrderScreen) and the customer menu/checkout
 * screens, so both apps share one design.
 *
 * Pixel spec (from Penpot "Novo Pedido" / operator CreateOrderScreen):
 * - row: height 48, radius 8, padding 0 16, space-between,
 *   background = primary @ 6% opacity
 * - label: 14px / weight 400, color text
 * - amount: 20px / weight 400, color primary
 *
 * All colors come from the theme (operator palette reference).
 */
export function TotalRow({ totalCents, label = 'Total', testID }: TotalRowProps) {
  const theme = useTheme();

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    backgroundColor: withOpacity(theme.colors.primary, 0.06),
    borderRadius: 8,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const amountStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 20,
    fontWeight: '400',
    color: theme.colors.primary,
  };

  return (
    <View style={containerStyle} testID={testID}>
      <RNText style={labelStyle}>{label}</RNText>
      <RNText style={amountStyle}>{formatPrice(totalCents)}</RNText>
    </View>
  );
}
