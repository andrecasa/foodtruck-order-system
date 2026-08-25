import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { MenuItem } from '@order-system/shared';
import { Screen, ScrollContainer, Header, Text, FloatingButton } from '../components';
import { ErrorState } from '../components/ErrorState';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { formatPrice } from '../utils/format';

/** Groups menu items by category, preserving backend sort order */
function groupByCategory(items: MenuItem[]): { category: string; items: MenuItem[] }[] {
  const groups: { category: string; items: MenuItem[] }[] = [];
  const categoryMap = new Map<string, MenuItem[]>();

  for (const item of items) {
    if (!categoryMap.has(item.category)) {
      categoryMap.set(item.category, []);
      groups.push({ category: item.category, items: categoryMap.get(item.category)! });
    }
    categoryMap.get(item.category)!.push(item);
  }

  // Sort items within each category alphabetically
  for (const group of groups) {
    group.items.sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups;
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

  useFocusEffect(
    useCallback(() => {
      loadMenu();
    }, [loadMenu])
  );

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

  const categoryHeaderStyle: ViewStyle = {
    marginTop: 16,
    marginBottom: 8,
  };

  // Category title: 14px, weight 400, color text
  const categoryTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  // Item card container: matches Penpot "Item / ..." board
  const itemCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Screen padding={false}>
        <Header title="Cardápio" onBack={() => router.back()} />
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
        <Header title="Cardápio" onBack={() => router.back()} />
        <ErrorState message={error} onRetry={loadMenu} />
      </Screen>
    );
  }

  const groupedItems = groupByCategory(menuItems);

  return (
    <Screen padding={false}>
      <Header title="Cardápio" onBack={() => router.back()} />
      <View style={containerStyle}>
        <ScrollContainer style={{ paddingBottom: 72 }}>
          {groupedItems.map(({ category, items }) => (
            <View key={category}>
              <View style={categoryHeaderStyle}>
                <RNText style={categoryTitleStyle}>{category}</RNText>
              </View>
              {items.map((item) => (
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
          {groupedItems.length === 0 && (
            <View style={{ padding: 24, alignItems: 'center' }}>
              <Text size="md" color={theme.colors.textSecondary}>
                Nenhum item ativo no cardápio.
              </Text>
            </View>
          )}
        </ScrollContainer>

        {/* Floating "Adicionar" button — fixed at bottom */}
        <FloatingButton
          label="Adicionar"
          icon="add"
          onPress={() => router.push('/create-menu-item')}
          accessibilityHint="Navega para a tela de criação de item do cardápio"
        />
      </View>
    </Screen>
  );
}
