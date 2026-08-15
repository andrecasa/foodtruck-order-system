import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { MenuItem } from '@order-system/shared';
import { Screen, ScrollContainer, Header, Text } from '../components';
import { ToggleSwitch } from '../components/ToggleSwitch';
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
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadMenu = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const items = await apiClient.getAllMenuItems();
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
      const updated = await apiClient.toggleMenuItemStatus(id);
      // Update the item in-place without reloading the full list
      setMenuItems((prev) =>
        prev.map((item) => (item.id === id ? updated : item)),
      );
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

  const itemActionsStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  };

  // Icon Button Edit removed — no longer in design

  // Disabled item text opacity
  const itemDisabledStyle: ViewStyle = {
    opacity: 0.5,
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

  // "Novo Item" inline button — Penpot specs:
  // full width (fill), height 44, bg white, border 1px #E8DDD5, borderRadius 22 (pill)
  // content: "+" 16px + "Novo Item" 14px, color #3D2020, gap 6, centered
  const novoItemBtnStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8DDD5',
    borderRadius: 22,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  };

  const novoItemPlusStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const novoItemTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
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
                <Pressable
                  key={item.id}
                  style={itemCardStyle}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${formatPrice(item.price)}, ${item.status === 'ativo' ? 'ativado' : 'desativado'}`}
                  onPress={() => {
                    router.push({
                      pathname: '/edit-menu-item',
                      params: {
                        id: item.id,
                        name: item.name,
                        price: String(item.price),
                        category: item.category,
                      },
                    });
                  }}
                  testID={`menu-item-card-${item.id}`}
                >
                  <View style={[itemInfoStyle, item.status === 'inativo' && itemDisabledStyle]}>
                    <RNText style={itemNameStyle}>{item.name}</RNText>
                    <RNText style={itemPriceStyle}>{formatPrice(item.price)}</RNText>
                  </View>
                  <View style={itemActionsStyle}>
                    <ToggleSwitch
                      value={item.status === 'ativo'}
                      onValueChange={() => handleToggleStatus(item.id)}
                      disabled={togglingId === item.id}
                      accessibilityLabel={`${item.status === 'ativo' ? 'Desativar' : 'Ativar'} ${item.name}`}
                      testID={`toggle-menu-item-${item.id}`}
                    />
                  </View>
                </Pressable>
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
          {/* Inline "+ Novo Item" button — matches Penpot design */}
          <Pressable
            style={novoItemBtnStyle}
            accessibilityRole="button"
            accessibilityLabel="Novo Item"
            accessibilityHint="Navega para a tela de criação de item do cardápio"
            onPress={() => {
              router.push('/create-menu-item');
            }}
          >
            <RNText style={novoItemPlusStyle}>+</RNText>
            <RNText style={novoItemTextStyle}>Novo Item</RNText>
          </Pressable>
        </ScrollContainer>
      </View>
    </Screen>
  );
}
