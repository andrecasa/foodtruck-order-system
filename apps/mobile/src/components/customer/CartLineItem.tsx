import React from 'react';
import {
  View,
  Text as RNText,
  Pressable,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { formatPrice } from '../../utils/format';
import type { CartItem } from '../../hooks/customer/useCart';

export interface CartLineItemProps {
  item: CartItem;
  /** Increment the quantity by one. */
  onIncrement: (menuItemId: string) => void;
  /** Decrement the quantity by one (removes the line when it reaches zero). */
  onDecrement: (menuItemId: string) => void;
  /** Remove the line entirely. */
  onRemove: (menuItemId: string) => void;
  /** When true, omits the bottom divider (used for the last row in a list). */
  isLast?: boolean;
}

/**
 * A single line in the cart bottom sheet: item name, unit price, quantity
 * stepper (+/-), per-line subtotal and a remove button.
 *
 * Prices are in centavos and passed straight to `formatPrice` (which expects
 * centavos) — no conversion.
 */
export function CartLineItem({
  item,
  onIncrement,
  onDecrement,
  onRemove,
  isLast = false,
}: CartLineItemProps) {
  const theme = useTheme();

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: isLast ? 0 : 1,
    borderBottomColor: theme.colors.divider,
    gap: theme.spacing.sm,
  };

  const infoStyle: ViewStyle = { flex: 1, gap: theme.spacing.xs };

  const nameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const unitPriceStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.sm,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.textSecondary,
  };

  const subtotalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.primary,
    minWidth: theme.spacing.lg * 3,
    textAlign: 'right',
  };

  const stepperStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  };

  const stepButtonStyle: ViewStyle = {
    width: theme.spacing.lg + theme.spacing.xs,
    height: theme.spacing.lg + theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const stepIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.lg,
    color: theme.colors.text,
  };

  const qtyStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.text,
    minWidth: theme.spacing.md + theme.spacing.xs,
    textAlign: 'center',
  };

  const removeIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.error,
  };

  return (
    <View style={rowStyle} testID={`cart-line-${item.menuItemId}`}>
      <View style={infoStyle}>
        <RNText style={nameStyle}>{item.name}</RNText>
        <RNText style={unitPriceStyle}>{formatPrice(item.priceCents)} cada</RNText>
      </View>

      <View style={stepperStyle}>
        <Pressable
          style={stepButtonStyle}
          onPress={() => onDecrement(item.menuItemId)}
          accessibilityRole="button"
          accessibilityLabel={`Diminuir quantidade de ${item.name}`}
          testID={`cart-decrement-${item.menuItemId}`}
        >
          <RNText style={stepIconStyle}>remove</RNText>
        </Pressable>
        <RNText style={qtyStyle} testID={`cart-qty-${item.menuItemId}`}>
          {item.quantity}
        </RNText>
        <Pressable
          style={stepButtonStyle}
          onPress={() => onIncrement(item.menuItemId)}
          accessibilityRole="button"
          accessibilityLabel={`Aumentar quantidade de ${item.name}`}
          testID={`cart-increment-${item.menuItemId}`}
        >
          <RNText style={stepIconStyle}>add</RNText>
        </Pressable>
      </View>

      <RNText style={subtotalStyle}>{formatPrice(item.priceCents * item.quantity)}</RNText>

      <Pressable
        onPress={() => onRemove(item.menuItemId)}
        accessibilityRole="button"
        accessibilityLabel={`Remover ${item.name} do carrinho`}
        testID={`cart-remove-${item.menuItemId}`}
        hitSlop={8}
      >
        <RNText style={removeIconStyle}>delete</RNText>
      </Pressable>
    </View>
  );
}
