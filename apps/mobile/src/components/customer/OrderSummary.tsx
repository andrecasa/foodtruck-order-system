import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../../theme';
import { formatPrice } from '../../utils/format';

/** A single line rendered by OrderSummary: name, quantity and unit price (centavos). */
export interface OrderSummaryLine {
  /** Stable key for the row (menuItemId in checkout, itemName index in tracking). */
  key: string;
  name: string;
  quantity: number;
  /** Unit price in centavos. */
  unitPriceCents: number;
}

export interface OrderSummaryProps {
  /** Ordered list of lines to render. */
  lines: OrderSummaryLine[];
  /** Grand total in centavos. */
  totalCents: number;
  /**
   * Whether to render the divider + "Total" footer row. Defaults to true.
   * Set false where the total is shown elsewhere (e.g. tracking screen's
   * bottom bar) to avoid a redundant total.
   */
  showTotal?: boolean;
  testID?: string;
}

/**
 * Read-only summary of an order's items and total.
 *
 * Reused by the checkout screen (from the cart) and the tracking screen (from
 * the fetched order). Each line shows quantity × name and its line subtotal;
 * the footer shows the grand total. Prices are formatted with `formatPrice`
 * (expects centavos).
 */
export function OrderSummary({ lines, totalCents, showTotal = true, testID }: OrderSummaryProps) {
  const theme = useTheme();

  const containerStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  };

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  };

  const qtyNameStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const lineTotalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const dividerStyle: ViewStyle = {
    height: 1,
    backgroundColor: theme.colors.divider,
  };

  const totalRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const totalLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const totalValueStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.primary,
  };

  return (
    <View style={containerStyle} testID={testID}>
      {lines.map((line) => (
        <View key={line.key} style={rowStyle}>
          <RNText style={qtyNameStyle}>
            {line.quantity}× {line.name}
          </RNText>
          <RNText style={lineTotalStyle}>
            {formatPrice(line.unitPriceCents * line.quantity)}
          </RNText>
        </View>
      ))}

      {showTotal ? (
        <>
          <View style={dividerStyle} />

          <View style={totalRowStyle}>
            <RNText style={totalLabelStyle}>Total</RNText>
            <RNText style={totalValueStyle} testID="order-summary-total">
              {formatPrice(totalCents)}
            </RNText>
          </View>
        </>
      ) : null}
    </View>
  );
}
