import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import type { PublicMenuCategory, PublicMenuItem } from '@order-system/shared';
import { useTheme } from '../../theme';
import { CustomerMenuItem } from './CustomerMenuItem';

export interface CategorySectionProps {
  category: PublicMenuCategory;
  /** Called when an item's "Adicionar" button is pressed. */
  onAddItem: (item: PublicMenuItem) => void;
}

/**
 * Renders a single menu category: a section title followed by its list of
 * items (each rendered with `CustomerMenuItem`). Used by CustomerMenuScreen to
 * visually separate categories.
 */
export function CategorySection({ category, onAddItem }: CategorySectionProps) {
  const theme = useTheme();

  const headerStyle: ViewStyle = {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  return (
    <View testID={`category-section-${category.name}`}>
      <View style={headerStyle}>
        <RNText style={titleStyle} accessibilityRole="header">
          {category.name}
        </RNText>
      </View>
      {category.items.map((item) => (
        <CustomerMenuItem key={item.id} item={item} onAdd={onAddItem} />
      ))}
    </View>
  );
}
