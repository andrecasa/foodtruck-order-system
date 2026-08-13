import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { Screen, ScrollContainer, Header } from '../components/Layout';
import { Text } from '../components/Typography';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { apiClient } from '../services/api-client';
import type { MenuItem, Order, OrderOrigin } from '@order-system/shared';

/** Map of menuItemId → quantity for selected items */
type SelectedItems = Record<string, number>;

/**
 * Formats a value in centavos to BRL currency string (R$ X,XX).
 */
function formatCurrency(centavos: number): string {
  const reais = centavos / 100;
  return `R$ ${reais.toFixed(2).replace('.', ',')}`;
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
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  // Load menu items on mount
  useEffect(() => {
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
  }, []);

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

    if (!customerName.trim()) {
      setCustomerNameError('Informe o nome do cliente');
      isValid = false;
    } else {
      setCustomerNameError('');
    }

    const hasItems = Object.values(selectedItems).some((qty) => qty > 0);
    if (!hasItems) {
      setItemsError('Adicione ao menos um item ao pedido');
      isValid = false;
    } else {
      setItemsError('');
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
      // Show success state for 2 seconds before navigating to payment
      setSuccessOrder(order);
      setTimeout(() => {
        // Reset form
        setCustomerName('');
        setOrigin('presencial');
        setSelectedItems({});
        setSuccessOrder(null);
        // Navigate to payment screen with the newly created order
        router.push({ pathname: '/(tabs)/payment', params: { orderId: order.id } });
      }, 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar pedido';
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
    borderColor: '#E8DDD5',
    backgroundColor: '#FFFFFF',
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
    color: selected ? '#FFFFFF' : '#8B6B5A',
  });

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const categoryLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
    marginTop: 12,
  };

  const itemsCardStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    paddingHorizontal: 14,
    gap: 10,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.04)',
    elevation: 1,
    borderWidth: 0,
  };

  const menuItemRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40,
  };

  const menuItemInfoStyle: ViewStyle = {
    flex: 1,
    marginRight: 8,
  };

  const itemNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const itemPriceStyle: TextStyle = {
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
    borderColor: '#E8DDD5',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const stepperMinusTextStyle = (qty: number): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: qty <= 0 ? '#E8DDD5' : theme.colors.text,
  });

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
    color: '#FFFFFF',
  };

  const quantityTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    minWidth: 20,
    textAlign: 'center',
  };

  const totalContainerStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(123,45,45,0.06)',
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Success state — shows briefly before navigating to payment
  if (successOrder) {
    return (
      <Screen padding={false}>
        <Header title="Novo Pedido" icon="add_circle" />
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 32,
            gap: 12,
          }}
        >
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 18,
              fontWeight: '500',
              color: theme.colors.text,
              textAlign: 'center',
            }}
          >
            Pedido #{successOrder.dailyNumber} criado!
          </RNText>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 16,
              fontWeight: '400',
              color: '#8B6B5A',
              textAlign: 'center',
            }}
          >
            {successOrder.customerName} — {formatCurrency(successOrder.totalAmount)}
          </RNText>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 12,
              fontWeight: '400',
              color: '#8B6B5A',
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            Redirecionando para pagamento...
          </RNText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      {/* AppBar */}
      <Header title="Novo Pedido" icon="add_circle" />

      <ScrollContainer padding={false} style={contentStyle}>
        {/* Customer Name */}
        <Input
          accessibilityLabel="Nome do Cliente"
          value={customerName}
          onChangeText={(text) => {
            setCustomerName(text.slice(0, 100));
            if (customerNameError) setCustomerNameError('');
          }}
          placeholder="Nome do cliente..."
          icon="person"
          iconColor="#8B6B5A"
          error={customerNameError}
          testID="input-customer-name"
        />

        {/* Origin Selector */}
        <View>
          <RNText style={originLabelStyle}>Origem do Pedido</RNText>
          <View style={originSelectorStyle}>
            <TouchableOpacity
              style={originTabStyle(origin === 'presencial')}
              onPress={() => setOrigin('presencial')}
              accessibilityRole="radio"
              accessibilityState={{ selected: origin === 'presencial' }}
              accessibilityLabel="Presencial"
              testID="origin-presencial"
            >
              <RNText style={originTabTextStyle(origin === 'presencial')}>Presencial</RNText>
            </TouchableOpacity>
            <TouchableOpacity
              style={originTabStyle(origin === 'whatsapp')}
              onPress={() => setOrigin('whatsapp')}
              accessibilityRole="radio"
              accessibilityState={{ selected: origin === 'whatsapp' }}
              accessibilityLabel="WhatsApp"
              testID="origin-whatsapp"
            >
              <RNText style={originTabTextStyle(origin === 'whatsapp')}>WhatsApp</RNText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Menu Items Selection */}
        <View>
          <RNText style={sectionTitleStyle}>Itens do Pedido</RNText>

          {menuLoading && (
            <Text size="sm" color="#8B6B5A">
              Carregando cardápio...
            </Text>
          )}

          {apiError && !menuLoading && (
            <RNText style={errorTextStyle}>{apiError}</RNText>
          )}

          {!menuLoading && categories.map((category) => (
            <View key={category}>
              <RNText style={categoryLabelStyle}>{category}</RNText>
              <View style={itemsCardStyle}>
                {groupedItems[category]!.map((item) => {
                  const qty = selectedItems[item.id] ?? 0;
                  return (
                    <View key={item.id} style={menuItemRowStyle}>
                      <View style={menuItemInfoStyle}>
                        <RNText style={itemNameStyle}>{item.name}</RNText>
                        <RNText style={itemPriceStyle}>{formatCurrency(item.price)}</RNText>
                      </View>
                      <View style={stepperContainerStyle}>
                        <TouchableOpacity
                          style={stepperMinusStyle}
                          onPress={() => decrementItem(item.id)}
                          disabled={qty <= 0}
                          accessibilityRole="button"
                          accessibilityLabel={`Diminuir quantidade de ${item.name}`}
                          testID={`decrement-${item.id}`}
                        >
                          <RNText style={stepperMinusTextStyle(qty)}>−</RNText>
                        </TouchableOpacity>
                        <RNText style={quantityTextStyle}>{qty}</RNText>
                        <TouchableOpacity
                          style={stepperPlusStyle}
                          onPress={() => incrementItem(item.id)}
                          disabled={qty >= 99}
                          accessibilityRole="button"
                          accessibilityLabel={`Aumentar quantidade de ${item.name}`}
                          testID={`increment-${item.id}`}
                        >
                          <RNText style={stepperPlusTextStyle}>+</RNText>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

          {itemsError ? (
            <RNText style={errorTextStyle}>{itemsError}</RNText>
          ) : null}
        </View>

        {/* Total */}
        <View style={totalContainerStyle}>
          <RNText style={totalLabelStyle}>Total</RNText>
          <RNText style={totalAmountStyle}>{formatCurrency(total)}</RNText>
        </View>

        {/* Submit Button */}
        <Button
          title="Criar Pedido"
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          testID="submit-order"
        />
      </ScrollContainer>
    </Screen>
  );
}
