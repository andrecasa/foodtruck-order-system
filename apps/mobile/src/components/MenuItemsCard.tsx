import React from 'react';
import { View, Text as RNText, TouchableOpacity, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { formatPrice } from '../utils/format';

/** A single selectable line: id + display name + price in centavos. */
export interface MenuItemsCardItem {
  id: string;
  name: string;
  /** Unit price in centavos (passed straight to `formatPrice`). */
  priceCents: number;
}

export interface MenuItemsCardProps {
  /** Category label rendered above the card. */
  category: string;
  /** Items rendered as rows inside the single card. */
  items: MenuItemsCardItem[];
  /** Map of itemId → selected quantity (0 when absent). */
  quantities: Record<string, number>;
  /** Increment an item's quantity by one. */
  onIncrement: (id: string) => void;
  /** Decrement an item's quantity by one. */
  onDecrement: (id: string) => void;
  /** Max quantity per item (disables the plus button at the cap). Defaults to 99. */
  maxQuantity?: number;
  /**
   * When true, an item at quantity 0 renders an "Adicionar" pill button instead
   * of the `− 0 +` stepper. Tapping it increments to 1 (same handler as plus),
   * revealing the stepper. Matches the "Clientes - Novo Pedido" reference.
   * Defaults to false (always show the stepper).
   */
  showAddButton?: boolean;
  /**
   * When true, hides the category label above the card (the caller provides its
   * own section heading). Defaults to false.
   */
  hideCategoryLabel?: boolean;
}

/**
 * Category items card — the single source of truth for the "Itens do Pedido"
 * card used by the operator's Novo Pedido (CreateOrderScreen) and the customer
 * menu/checkout screens, so both apps share one design.
 *
 * Pixel spec (from Penpot "Novo Pedido" / operator CreateOrderScreen):
 * - category label: 13px / weight 400, color text, marginTop 12, marginBottom 8
 * - card: surface bg, radius 12, padding 10 (vertical) / 14 (horizontal), gap 10, no border
 * - row: 40px, space-between; name 14px, price 12px (both color text)
 * - stepper: minus 28px circle (background bg + 1px border, glyph disabled at 0),
 *   quantity 14px min-width 20 centered, plus 28px circle filled primary (white glyph)
 *
 * All colors come from the theme (operator palette reference).
 */
export function MenuItemsCard({
  category,
  items,
  quantities,
  onIncrement,
  onDecrement,
  maxQuantity = 99,
  showAddButton = false,
  hideCategoryLabel = false,
}: MenuItemsCardProps) {
  const theme = useTheme();

  const categoryLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 12,
  };

  const itemsCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 14,
    gap: 10,
    borderWidth: 0,
  };

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  };

  const infoStyle: ViewStyle = { flex: 1, marginRight: 8 };

  const nameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const priceStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const stepperContainerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  };

  const stepperMinusStyle: ViewStyle = {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const stepperPlusStyle: ViewStyle = {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const stepperPlusTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.surface,
  };

  const quantityTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    minWidth: 20,
    textAlign: 'center',
  };

  // "Adicionar" pill shown at quantity 0 (customer reference). Matches the
  // stepper height (28px, radius 14) so the row height stays consistent.
  const addButtonStyle: ViewStyle = {
    width: 92,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const addButtonTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.surface,
  };

  return (
    <View testID={`category-section-${category}`}>
      {hideCategoryLabel ? null : (
        <RNText style={categoryLabelStyle} accessibilityRole="header">
          {category}
        </RNText>
      )}
      <View style={itemsCardStyle}>
        {items.map((item) => {
          const qty = quantities[item.id] ?? 0;
          const minusTextStyle: TextStyle = {
            fontFamily: theme.typography.fontFamily,
            fontSize: 16,
            fontWeight: '400',
            color: qty <= 0 ? theme.colors.textDisabled : theme.colors.text,
          };
          return (
            <View key={item.id} style={rowStyle} testID={`menu-item-${item.id}`}>
              <View style={infoStyle}>
                <RNText style={nameStyle}>{item.name}</RNText>
                <RNText style={priceStyle}>{formatPrice(item.priceCents)}</RNText>
              </View>
              {showAddButton && qty <= 0 ? (
                <TouchableOpacity
                  style={addButtonStyle}
                  onPress={() => onIncrement(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Adicionar ${item.name}`}
                  testID={`add-${item.id}`}
                >
                  <RNText style={addButtonTextStyle}>Adicionar</RNText>
                </TouchableOpacity>
              ) : (
                <View style={stepperContainerStyle}>
                  <TouchableOpacity
                    style={stepperMinusStyle}
                    onPress={() => onDecrement(item.id)}
                    disabled={qty <= 0}
                    accessibilityRole="button"
                    accessibilityLabel={`Diminuir quantidade de ${item.name}`}
                    testID={`decrement-${item.id}`}
                  >
                    <RNText style={minusTextStyle}>−</RNText>
                  </TouchableOpacity>
                  <RNText style={quantityTextStyle} testID={`qty-${item.id}`}>
                    {qty}
                  </RNText>
                  <TouchableOpacity
                    style={stepperPlusStyle}
                    onPress={() => onIncrement(item.id)}
                    disabled={qty >= maxQuantity}
                    accessibilityRole="button"
                    accessibilityLabel={`Aumentar quantidade de ${item.name}`}
                    testID={`increment-${item.id}`}
                  >
                    <RNText style={stepperPlusTextStyle}>+</RNText>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
