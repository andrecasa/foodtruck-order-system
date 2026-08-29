import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import type { PublicMenuItem } from '@order-system/shared';
import { Button } from '../Button';
import { useTheme } from '../../theme';
import { formatPrice } from '../../utils/format';

export interface CustomerMenuItemProps {
  item: PublicMenuItem;
  /** Called when the customer taps "Adicionar" (adds one unit to the cart). */
  onAdd: (item: PublicMenuItem) => void;
}

/**
 * A single menu item row in the public customer menu.
 *
 * Shows the item name and its BRL-formatted price, plus an "Adicionar" button
 * that adds one unit to the cart.
 *
 * Price unit note: `PublicMenuItem.priceCents` is in integer centavos, which is
 * exactly what `formatPrice` expects (it divides by 100). So `priceCents` is
 * passed straight through — no conversion. This mirrors the operator MenuScreen,
 * which passes `MenuItem.price` (also centavos) directly to `formatPrice`.
 */
export function CustomerMenuItem({ item, onAdd }: CustomerMenuItemProps) {
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

  return (
    <View style={cardStyle} testID={`customer-menu-item-${item.id}`}>
      <View style={infoStyle}>
        <RNText style={nameStyle}>{item.name}</RNText>
        <RNText style={priceStyle}>{formatPrice(item.priceCents)}</RNText>
      </View>
      <Button
        title="Adicionar"
        variant="primary"
        size="sm"
        onPress={() => onAdd(item)}
        testID={`add-item-${item.id}`}
      />
    </View>
  );
}
