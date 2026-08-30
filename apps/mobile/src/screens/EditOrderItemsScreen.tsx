import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text as RNText,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { Screen, ScrollContainer, Header } from '../components/Layout';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { MenuItemsCard } from '../components/MenuItemsCard';
import { apiClient } from '../services/api-client';
import { SwipeableOriginSelector } from '../components/SwipeableOriginSelector';
import type { MenuItem, Order, OrderOrigin } from '@order-system/shared';
import { formatPrice } from '../utils/format';
import { withOpacity } from '../utils/color';

/** Map of menuItemId → quantity for selected items */
type SelectedItems = Record<string, number>;

export interface EditOrderItemsScreenProps {
  /** The order ID to edit items for */
  orderId: string;
  /** The current order data (passed from navigation) */
  order: Order;
}

/**
 * Groups menu items by category.
 */
function groupByCategory(items: MenuItem[]): Record<string, MenuItem[]> {
  const grouped: Record<string, MenuItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category]!.push(item);
  }
  return grouped;
}

/**
 * Initializes stepper quantities from existing order items,
 * only including items whose menu item is still active.
 */
export function initializeStepperQuantities(
  orderItems: Order['items'],
  activeMenuItems: MenuItem[],
): SelectedItems {
  const activeIds = new Set(activeMenuItems.map((m) => m.id));
  const selected: SelectedItems = {};
  for (const item of orderItems) {
    if (activeIds.has(item.menuItemId)) {
      selected[item.menuItemId] = item.quantity;
    }
  }
  return selected;
}

/**
 * Editar Itens (Edit Order Items) Screen.
 *
 * Reuses the stepper UI pattern from CreateOrderScreen with:
 * - No customer name or origin fields
 * - Header "Editar Itens"
 * - Button "Salvar Alterações"
 * - Pre-fills quantities from existing order items (only active menu items)
 */
export function EditOrderItemsScreen({ orderId, order }: EditOrderItemsScreenProps) {
  const theme = useTheme();
  const router = useRouter();

  // Form state
  const [customerName, setCustomerName] = useState(order.customerName);
  const [origin, setOrigin] = useState<OrderOrigin>(order.origin);
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({});
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState('');
  const [itemsError, setItemsError] = useState('');
  const [apiError, setApiError] = useState('');

  // Load menu items on mount and pre-fill quantities
  useEffect(() => {
    let cancelled = false;
    async function loadMenu() {
      try {
        setMenuLoading(true);
        setMenuError('');
        const items = await apiClient.getMenu();
        if (!cancelled) {
          setMenuItems(items);
          // Pre-fill stepper quantities from order items (only active menu items)
          const initial = initializeStepperQuantities(order.items, items);
          setSelectedItems(initial);
        }
      } catch {
        if (!cancelled) {
          setMenuError('Erro ao carregar cardápio');
        }
      } finally {
        if (!cancelled) {
          setMenuLoading(false);
        }
      }
    }
    loadMenu();
    return () => { cancelled = true; };
  }, [order.items]);

  // Group items by category
  const groupedItems = useMemo(() => groupByCategory(menuItems), [menuItems]);
  const categories = useMemo(() => Object.keys(groupedItems), [groupedItems]);

  // Calculate total in centavos
  const total = useMemo(() => {
    let sum = 0;
    for (const [menuItemId, quantity] of Object.entries(selectedItems)) {
      const item = menuItems.find((m) => m.id === menuItemId);
      if (item && quantity > 0) {
        sum += item.price * quantity;
      }
    }
    return sum;
  }, [selectedItems, menuItems]);

  // Check if any items are selected
  const hasItems = useMemo(() => {
    return Object.values(selectedItems).some((qty) => qty > 0);
  }, [selectedItems]);

  // Item quantity management
  const incrementItem = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const current = prev[id] ?? 0;
      if (current >= 99) return prev;
      return { ...prev, [id]: current + 1 };
    });
    setItemsError('');
  }, []);

  const decrementItem = useCallback((id: string) => {
    setSelectedItems((prev) => {
      const current = prev[id] ?? 0;
      if (current <= 0) return prev;
      const newQty = current - 1;
      if (newQty === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: newQty };
    });
  }, []);

  // Submit updated items
  const handleSubmit = async () => {
    setApiError('');

    if (!hasItems) {
      setItemsError('Adicione ao menos um item ao pedido');
      return;
    }

    const items = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    try {
      setLoading(true);
      const updatedOrder = await apiClient.updateOrderItems(orderId, { items, customerName: customerName.trim(), origin });
      // Navigate back to PaymentScreen with updated order data (replace to avoid stale edit screen in stack)
      router.replace({ pathname: '/(tabs)/payment', params: { orderId: updatedOrder.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar itens do pedido';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    padding: 16,
    gap: 20,
  };

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const originLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 20,
  };

  const originSelectorStyle: ViewStyle = {
    flexDirection: 'row',
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    alignItems: 'center',
    padding: 2,
    marginTop: 8,
  };

  const originTabStyle = (selected: boolean): ViewStyle => ({
    flex: 1,
    height: 36,
    borderRadius: 18,
    backgroundColor: selected ? theme.colors.primary : 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const originTabTextStyle = (selected: boolean): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '400',
    color: selected ? theme.colors.surface : theme.colors.textSecondary,
  });

  const totalContainerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    backgroundColor: withOpacity(theme.colors.primary, 0.06),
    borderRadius: 8,
  };

  const totalLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const totalAmountStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 20,
    fontWeight: '400',
    color: theme.colors.primary,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  const centerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Loading state while menu is loading
  if (menuLoading) {
    return (
      <Screen padding={false}>
        <Header title="Pedido" onBack={() => router.back()} />
        <View style={centerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} testID="loading-indicator" />
          <Text size="sm" color={theme.colors.textSecondary} style={{ marginTop: 12 }}>
            Carregando cardápio...
          </Text>
        </View>
      </Screen>
    );
  }

  // Error state if menu failed to load
  if (menuError) {
    return (
      <Screen padding={false}>
        <Header title="Pedido" onBack={() => router.back()} />
        <View style={centerStyle}>
          <RNText style={{ ...errorTextStyle, fontSize: 14 }} testID="menu-error">
            {menuError}
          </RNText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      {/* AppBar */}
      <Header title="Pedido" onBack={() => router.back()} />

      <ScrollContainer padding={false} style={contentStyle}>
        {/* Customer Name */}
        <Input
          accessibilityLabel="Nome do Cliente"
          value={customerName}
          onChangeText={(text) => setCustomerName(text.slice(0, 100))}
          placeholder="Nome do cliente..."
          icon="person"
          iconColor={theme.colors.textSecondary}
          testID="input-customer-name"
        />

        {/* Origin Selector */}
        <View>
          <RNText style={originLabelStyle}>Origem do Pedido</RNText>
          <SwipeableOriginSelector
            value={origin}
            onChange={setOrigin}
            primaryColor={theme.colors.primary}
            surfaceColor={theme.colors.surface}
            borderColor={theme.colors.border}
            backgroundColor={theme.colors.surface}
            inactiveTextColor={theme.colors.textSecondary}
            fontFamily={theme.typography.fontFamily}
            testID="origin-selector"
          />
        </View>

        {/* Menu Items Selection */}
        <View>
          <RNText style={sectionTitleStyle}>Itens do Pedido</RNText>

          {categories.map((category) => (
            <MenuItemsCard
              key={category}
              category={category}
              items={groupedItems[category]!.map((item) => ({
                id: item.id,
                name: item.name,
                priceCents: item.price,
              }))}
              quantities={selectedItems}
              onIncrement={incrementItem}
              onDecrement={decrementItem}
              showAddButton
            />
          ))}

          {itemsError ? (
            <RNText style={errorTextStyle} testID="items-error">{itemsError}</RNText>
          ) : null}
        </View>

        {/* Total */}
        <View style={totalContainerStyle}>
          <RNText style={totalLabelStyle}>Total</RNText>
          <RNText style={totalAmountStyle} testID="total-amount">{formatPrice(total)}</RNText>
        </View>

        {/* API Error */}
        {apiError ? (
          <RNText style={errorTextStyle} testID="api-error">{apiError}</RNText>
        ) : null}

        {/* Submit Button */}
        <Button
          title="Salvar Alterações"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          testID="submit-edit-order"
        />
      </ScrollContainer>
    </Screen>
  );
}
