import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { FormScreen } from '../components/FormScreen';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { FloatingButton } from '../components/FloatingButton';
import { MenuItemsCard } from '../components/MenuItemsCard';
import { TotalRow } from '../components/TotalRow';
import { apiClient } from '../services/api-client';
import { SwipeableOriginSelector } from '../components/SwipeableOriginSelector';
import type { MenuItem, OrderOrigin } from '@order-system/shared';

/** Map of menuItemId → quantity for selected items */
type SelectedItems = Record<string, number>;

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
 * Novo Pedido (Create Order) Screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs (Pastel das Meninas palette):
 * - AppBar: bg white, shadow 0 1px 3px rgba(0,0,0,0.06), height 56px, title "Novo Pedido" 18px weight 400, color text (#3D2020)
 * - Content: padding 16px, gap 20px
 * - Origin label: "Origem do Pedido" 14px weight 400, color text (#3D2020)
 * - Origin Selector: height 40px, radius 20px, border 1px divider (#E8DDD5), bg white
 *   - Active tab: bg primary (#7B2D2D), text white 13px weight 400, radius 18px
 *   - Inactive tab: bg transparent, text textSecondary (#8B6B5A) 13px weight 400
 * - Section title "Itens do Pedido": 14px weight 400, color text (#3D2020)
 * - Category label: 13px weight 400, color text (#3D2020)
 * - Items Card: bg white, radius 12px, shadow 0 1px 3px rgba(0,0,0,0.04), padding 10px 14px, gap 10px
 * - Item row: height 40px, flex row space-between
 *   - Name: 14px weight 400, color text (#3D2020)
 *   - Price: 12px weight 400, color text (#3D2020)
 *   - Stepper circle 28px: minus (bg background, border 1px divider, text divider when 0), plus (bg primary, text white)
 *   - Quantity: 14px weight 400, color text (#3D2020)
 * - Total row: bg rgba(123,45,45,0.06), radius 8px, height 48px, padding 0 16px
 *   - "Total" text: 14px weight 400, color text (#3D2020)
 *   - Amount: 20px weight 400, color primary (#7B2D2D)
 * - Button "Criar Pedido": height 44px, radius 22px, bg primary (#7B2D2D), text 14px weight 400
 */
export function CreateOrderScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Form state
  const [customerName, setCustomerName] = useState('');
  const [origin, setOrigin] = useState<OrderOrigin>('presencial');
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({});
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [menuLoading, setMenuLoading] = useState(true);
  const [customerNameError, setCustomerNameError] = useState('');
  const [itemsError, setItemsError] = useState('');
  const [apiError, setApiError] = useState('');

  // Refs for focus management
  const customerNameRef = useRef<TextInput>(null);

  // Load menu items when screen gains focus (e.g., after editing menu)
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function loadMenu() {
        try {
          setMenuLoading(true);
          const items = await apiClient.getMenu();
          if (!cancelled) {
            setMenuItems(items);
          }
        } catch {
          if (!cancelled) {
            setApiError('Erro ao carregar cardápio');
          }
        } finally {
          if (!cancelled) {
            setMenuLoading(false);
          }
        }
      }
      loadMenu();
      return () => { cancelled = true; };
    }, [])
  );

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

  // Validation
  const validate = (): boolean => {
    let isValid = true;
    let firstErrorField: 'customerName' | 'items' | null = null;

    if (!customerName.trim()) {
      setCustomerNameError('Informe o nome do cliente');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'customerName';
    } else {
      setCustomerNameError('');
    }

    const hasItems = Object.values(selectedItems).some((qty) => qty > 0);
    if (!hasItems) {
      setItemsError('Adicione ao menos um item ao pedido');
      isValid = false;
      if (!firstErrorField) firstErrorField = 'items';
    } else {
      setItemsError('');
    }

    // Focus on the first field with error
    if (firstErrorField === 'customerName') {
      customerNameRef.current?.focus();
    }

    return isValid;
  };

  // Submit order
  const handleSubmit = async () => {
    setApiError('');
    if (!validate()) return;

    const items = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    try {
      setLoading(true);
      const order = await apiClient.createOrder({
        customerName: customerName.trim(),
        origin,
        items,
      });
      // Reset form and navigate directly to payment
      setCustomerName('');
      setOrigin('presencial');
      setSelectedItems({});
      router.push({ pathname: '/(tabs)/payment', params: { orderId: order.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar pedido';
      setApiError(message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    // Top padding handled by the fixed name bar above.
    paddingTop: 8,
    gap: 20,
    // Room so the last content clears the floating Total (48) + CTA (44) stack.
    paddingBottom: 16 + 44 + 8 + 48 + 16,
  };

  // Fixed name bar below the header (matches content horizontal padding).
  const nameBarStyle: ViewStyle = {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: theme.colors.background,
  };

  // Floating Total container — pinned just above the CTA (bottom:16, height 44),
  // so the total floats at 16 + 44 + 8. Uses the opaque `surfacePrimary` tint
  // (matches the TotalRow look) so scrolled content does not bleed through.
  const floatingTotalStyle: ViewStyle = {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16 + 44 + 8,
    backgroundColor: theme.colors.surfacePrimary,
    borderRadius: 8,
  };

  // Full-width solid panel behind the floating Total + CTA so no scrolled
  // content shows through the gaps. Uses the screen background, matching the
  // fixed name bar.
  // const floatingBackdropStyle: ViewStyle = {
  //   position: 'absolute',
  //   left: 0,
  //   right: 0,
  //   bottom: 0,
  //   height: 16 + 44 + 8 + 48 + 8,
  //   backgroundColor: theme.colors.background,
  // };

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

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: 4,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <FormScreen
      title="Pedido"
      onBack={() => router.back()}
      contentContainerStyle={contentStyle}
      stickyHeader={
        <View style={nameBarStyle}>
          {/* Customer Name — fixed above the scrollable item list. */}
          <Input
            accessibilityLabel="Nome do Cliente"
            value={customerName}
            onChangeText={(text) => {
              setCustomerName(text.slice(0, 100));
              if (customerNameError) setCustomerNameError('');
            }}
            placeholder="Nome do cliente..."
            icon="person"
            iconColor={theme.colors.textSecondary}
            error={customerNameError}
            testID="input-customer-name"
            inputRef={customerNameRef}
          />
        </View>
      }
      footer={
        <>
          {/* Solid backing panel behind the floating Total + CTA. */}
          {/* <View style={floatingBackdropStyle} pointerEvents="none" /> */}
          {/* Floating Total — pinned just above the CTA. */}
          <View style={floatingTotalStyle}>
            <TotalRow totalCents={total} />
          </View>
          <FloatingButton
            label="Criar Pedido"
            onPress={handleSubmit}
            disabled={loading}
            bottomOffset={16}
            testID="submit-order"
          />
        </>
      }
    >
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

          {menuLoading && (
            <Text size="sm" color={theme.colors.textSecondary}>
              Carregando cardápio...
            </Text>
          )}

          {apiError && !menuLoading ? (
            <RNText style={errorTextStyle}>{apiError}</RNText>
          ) : null}

          {!menuLoading && categories.map((category) => (
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
            <RNText style={errorTextStyle}>{itemsError}</RNText>
          ) : null}
        </View>
    </FormScreen>
  );
}
