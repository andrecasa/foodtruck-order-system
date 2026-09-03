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
import { Screen, Header } from '../components/Layout';
import { FormScreen } from '../components/FormScreen';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { MenuItemsCard } from '../components/MenuItemsCard';
import { TotalRow } from '../components/TotalRow';
import { FloatingButton } from '../components/FloatingButton';
import { apiClient } from '../services/api-client';
import { SwipeableOriginSelector, type OriginOption } from '../components/SwipeableOriginSelector';
import type { MenuItem, Order, OrderOrigin } from '@order-system/shared';

/** Map of menuItemId → quantity for selected items */
type SelectedItems = Record<string, number>;

/**
 * Origin segments shown in the edit screen. Includes "QrCode" (web) so that
 * web orders can display (and lock) their origin. For Presencial/WhatsApp
 * orders the "QrCode" segment is rendered but disabled (never selectable).
 */
const ORIGIN_OPTIONS_WITH_WEB: OriginOption[] = [
  { key: 'presencial', label: 'Presencial' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'web', label: 'QrCode' },
];

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

  // CTA is enabled only when a customer name is filled AND at least one item
  // is selected. Otherwise it stays inactive.
  const canSubmit = useMemo(() => {
    return customerName.trim().length > 0 && hasItems;
  }, [customerName, hasItems]);

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
      router.replace({ pathname: '/payment', params: { orderId: updatedOrder.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar itens do pedido';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  // The bottom tab bar is now provided by the (tabs) navigator (outside this
  // screen), so the floating Total + CTA stack mirrors CreateOrderScreen exactly:
  // CTA at bottom:16 (height 44), Total just above it, backdrop behind both.
  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 20,
    // Room so the last content clears the floating Total (48) + CTA (44) stack.
    paddingBottom: 16 + 44 + 8 + 48 + 16,
  };

  // Full-width solid panel behind the floating Total + CTA so no scrolled
  // content shows through the gaps. Uses the screen background.
  const floatingBackdropStyle: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 16 + 44 + 8 + 48 + 8,
    backgroundColor: theme.colors.background,
  };

  // Floating Total — pinned just above the CTA. Opaque tint so scrolled
  // content does not bleed through.
  const floatingTotalStyle: ViewStyle = {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16 + 44 + 8,
    backgroundColor: theme.colors.surfacePrimary,
    borderRadius: 8,
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
    <FormScreen
      title="Pedido"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
      footer={
        <>
          {/* Solid backing panel behind the floating Total + CTA. */}
          <View style={floatingBackdropStyle} pointerEvents="none" />
          {/* Floating Total — pinned just above the CTA. Mirrors CreateOrderScreen. */}
          <View style={floatingTotalStyle}>
            <TotalRow totalCents={total} testID="total-amount" />
          </View>
          <FloatingButton
            label="Salvar Alterações"
            onPress={handleSubmit}
            disabled={loading || !canSubmit}
            bottomOffset={16}
            testID="submit-edit-order"
          />
        </>
      }
    >
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
          options={ORIGIN_OPTIONS_WITH_WEB}
          // Pedidos vindos do PWA (web/QrCode) não podem ter a origem alterada.
          disabled={order.origin === 'web'}
          // Para pedidos Presencial/WhatsApp, "QrCode" é exibido mas nunca é
          // um destino selecionável.
          disabledOptions={order.origin === 'web' ? [] : ['web']}
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

        {/* API Error */}
        {apiError ? (
          <RNText style={errorTextStyle} testID="api-error">{apiError}</RNText>
        ) : null}
      </View>
    </FormScreen>
  );
}
