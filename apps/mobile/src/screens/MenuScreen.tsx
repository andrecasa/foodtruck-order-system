import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import type { MenuItem } from '@order-system/shared';
import { Screen, ScrollContainer, Header, Text } from '../components';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';

/** Groups menu items by category, sorting categories and items alphabetically */
function groupByCategory(items: MenuItem[]): Record<string, MenuItem[]> {
  const groups: Record<string, MenuItem[]> = {};

  for (const item of items) {
    if (!groups[item.category]) {
      groups[item.category] = [];
    }
    groups[item.category]!.push(item);
  }

  // Sort items within each category alphabetically
  for (const category of Object.keys(groups)) {
    groups[category]!.sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups;
}

/** Formats price in centavos to R$ X,XX */
function formatPrice(priceInCentavos: number): string {
  return `R$ ${(priceInCentavos / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Cardápio (Menu) Screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs:
 * - Content: padding 16px, gap 16px, column
 * - Category title: 16px weight 400, color #3D2020 (text)
 * - Item card: bg white, border 1px #E8DDD5, borderRadius 12, height 64,
 *   paddingHorizontal 16, flexDirection row, alignItems center, justifyContent space-between
 *   - Info (column, gap 2):
 *     - Name: 14px weight 400, color #3D2020 (text)
 *     - Price: 12px weight 400, color #7B2D2D (primary)
 *   - Btn Desativar: outline, border 1px #7B2D2D, borderRadius 18, height 36,
 *     text 12px weight 400, color #7B2D2D
 */
export function MenuScreen() {
  const theme = useTheme();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await apiClient.getMenu();
      setMenuItems(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar cardápio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const handleToggleStatus = useCallback(async (id: string) => {
    try {
      setTogglingId(id);
      await apiClient.toggleMenuItemStatus(id);
      const items = await apiClient.getMenu();
      setMenuItems(items);
    } catch {
      // Silently handle toggle errors
    } finally {
      setTogglingId(null);
    }
  }, []);

  // ─── Styles (Penpot-aligned) ────────────────────────────────────────────────

  const containerStyle: ViewStyle = {
    flex: 1,
  };

  const loadingContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  const errorContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  const categoryHeaderStyle: ViewStyle = {
    marginTop: 16,
    marginBottom: 8,
  };

  // Category title: 16px, weight 400, color text
  const categoryTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.text,
  };

  // Item card container: matches Penpot "Item / ..." board
  const itemCardStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD5',
    borderRadius: 12,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  };

  const itemInfoStyle: ViewStyle = {
    flex: 1,
    marginRight: 8,
    gap: 2,
  };

  // Item name: 14px, weight 400, color text
  const itemNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  // Item price: 12px, weight 400, color primary
  const itemPriceStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.primary,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen padding={false}>
        <Header title="Cardápio" icon="restaurant_menu" />
        <View style={loadingContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text size="md" style={{ marginTop: 8 }}>
            Carregando cardápio...
          </Text>
        </View>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen padding={false}>
        <Header title="Cardápio" icon="restaurant_menu" />
        <View style={errorContainerStyle}>
          <Text size="lg" color={theme.colors.error}>
            {error}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button title="Tentar novamente" onPress={loadMenu} variant="primary" />
          </View>
        </View>
      </Screen>
    );
  }

  const groupedItems = groupByCategory(menuItems);
  const sortedCategories = Object.keys(groupedItems).sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <Screen padding={false}>
      <Header title="Cardápio" icon="restaurant_menu" />
      <View style={containerStyle}>
        <ScrollContainer>
          {sortedCategories.map((category) => (
            <View key={category}>
              <View style={categoryHeaderStyle}>
                <RNText style={categoryTitleStyle}>{category}</RNText>
              </View>
              {groupedItems[category]!.map((item) => (
                <View
                  key={item.id}
                  style={itemCardStyle}
                  accessibilityLabel={`${item.name}, ${formatPrice(item.price)}`}
                >
                  <View style={itemInfoStyle}>
                    <RNText style={itemNameStyle}>{item.name}</RNText>
                    <RNText style={itemPriceStyle}>{formatPrice(item.price)}</RNText>
                  </View>
                  <Button
                    title="Desativar"
                    variant="outline"
                    size="sm"
                    color={theme.colors.primary}
                    onPress={() => handleToggleStatus(item.id)}
                    loading={togglingId === item.id}
                    disabled={togglingId === item.id}
                  />
                </View>
              ))}
            </View>
          ))}
          {sortedCategories.length === 0 && (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text size="md" color="#8B6B5A">
                Nenhum item ativo no cardápio.
              </Text>
            </View>
          )}
        </ScrollContainer>
      </View>
    </Screen>
  );
}
