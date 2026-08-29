import React from 'react';
import { View, Text as RNText, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import type { PublicMenuItem } from '@order-system/shared';
import { Button } from '../Button';
import { useTheme } from '../../theme';
import { formatPrice } from '../../utils/format';

export interface CustomerMenuItemProps {
  item: PublicMenuItem;
  /** Current quantity of this item in the cart (0 when not added yet). */
  quantity: number;
  /** Adds one unit to the cart (used when quantity is 0). */
  onAdd: (item: PublicMenuItem) => void;
  /** Increments this item's quantity by one. */
  onIncrement: (item: PublicMenuItem) => void;
  /** Decrements this item's quantity by one (removes the line at zero). */
  onDecrement: (item: PublicMenuItem) => void;
}

/**
 * A single menu item row in the public customer menu.
 *
 * Shows the item name and its BRL-formatted price. When the item is NOT in the
 * cart (quantity 0), it shows an "Adicionar" button. Once added, that control
 * becomes a `− qtd +` stepper (same visual language as the cart line stepper),
 * so quantity is managed inline without opening the cart.
 *
 * Price unit note: `PublicMenuItem.priceCents` is integer centavos, exactly what
 * `formatPrice` expects (divides by 100) — passed straight through.
 */
export function CustomerMenuItem({
  item,
  quantity,
  onAdd,
  onIncrement,
  onDecrement,
}: CustomerMenuItemProps) {
  const theme = useTheme();

  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    minHeight: theme.spacing.md * 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  };

  const infoStyle: ViewStyle = {
    flex: 1,
    marginRight: theme.spacing.sm,
    gap: theme.spacing.xs,
  };

  const nameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const priceStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.sm,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.primary,
  };

  // Stepper visuals mirror CartLineItem for consistency.
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

  return (
    <View style={cardStyle} testID={`customer-menu-item-${item.id}`}>
      <View style={infoStyle}>
        <RNText style={nameStyle}>{item.name}</RNText>
        <RNText style={priceStyle}>{formatPrice(item.priceCents)}</RNText>
      </View>

      {quantity > 0 ? (
        <View style={stepperStyle}>
          <Pressable
            style={stepButtonStyle}
            onPress={() => onDecrement(item)}
            accessibilityRole="button"
            accessibilityLabel={`Diminuir quantidade de ${item.name}`}
            testID={`decrement-item-${item.id}`}
          >
            <RNText style={stepIconStyle}>remove</RNText>
          </Pressable>
          <RNText style={qtyStyle} testID={`qty-item-${item.id}`}>
            {quantity}
          </RNText>
          <Pressable
            style={stepButtonStyle}
            onPress={() => onIncrement(item)}
            accessibilityRole="button"
            accessibilityLabel={`Aumentar quantidade de ${item.name}`}
            testID={`increment-item-${item.id}`}
          >
            <RNText style={stepIconStyle}>add</RNText>
          </Pressable>
        </View>
      ) : (
        <Button
          title="Adicionar"
          variant="primary"
          size="sm"
          onPress={() => onAdd(item)}
          testID={`add-item-${item.id}`}
        />
      )}
    </View>
  );
}
