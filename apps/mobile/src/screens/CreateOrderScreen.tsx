import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../theme/ThemeProvider';
import { FormScreen } from '../components/FormScreen';
import { Text } from '../components/Typography';
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
 * Novo Pedido (Create Order) Screen — etapa de seleção de itens do operador.
 *
 * Espelha o fluxo do PWA do cliente: aqui o operador escolhe a origem e os
 * itens; o nome do cliente e a confirmação ficam na etapa "Confirmar Pedido"
 * (`ConfirmOrderScreen`, rota `/confirm-order`). O CTA "Revisar Pedido" navega
 * para a confirmação carregando os itens selecionados e a origem via params.
 *
 * Penpot specs (Pastel das Meninas palette):
 * - AppBar: bg white, height 56px, title 18px weight 400, color text (#3D2020)
 * - Content: padding 16px, gap 20px
 * - Origin label: "Origem do Pedido" 14px weight 400, color text (#3D2020)
 * - Origin Selector: height 40px, radius 20px, border 1px divider, bg white
 * - Section title "Itens do Pedido": 14px weight 400, color text (#3D2020)
 * - Items Card: bg white, radius 12px, padding 10px 14px, gap 10px
 * - Total row: bg rgba(123,45,45,0.06), radius 8px, height 48px, padding 0 16px
 * - Button: height 44px, radius 22px, bg primary, text 14px weight 400
 */
export function CreateOrderScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Form state
  const [origin, setOrigin] = useState<OrderOrigin>('presencial');
  const [selectedItems, setSelectedItems] = useState<SelectedItems>({});
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  // UI state
  const [menuLoading, setMenuLoading] = useState(true);
  const [itemsError, setItemsError] = useState('');
  const [apiError, setApiError] = useState('');

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

  // O CTA "Revisar Pedido" é habilitado quando há ao menos um item selecionado.
  // O nome do cliente é solicitado na etapa de confirmação (padrão do PWA).
  const canReview = useMemo(
    () => Object.values(selectedItems).some((qty) => qty > 0),
    [selectedItems],
  );

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

  // Vai para a etapa de confirmação com os itens selecionados e a origem.
  // Os itens seguem serializados como JSON (params do expo-router são strings);
  // a tela de confirmação recarrega o cardápio para resolver nomes e preços.
  const handleReview = () => {
    setApiError('');
    const hasItems = Object.values(selectedItems).some((qty) => qty > 0);
    if (!hasItems) {
      setItemsError('Adicione ao menos um item ao pedido');
      return;
    }
    setItemsError('');

    const items = Object.entries(selectedItems)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    router.push({
      pathname: '/confirm-order',
      params: { items: JSON.stringify(items), origin },
    });
  };

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 20,
    // Room so the last content clears the floating Total (48) + CTA (44) stack.
    paddingBottom: 16 + 44 + 8 + 48 + 16,
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
  // content shows through the gaps. Uses the screen background.
  const floatingBackdropStyle: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 16 + 44 + 8 + 48 + 8,
    backgroundColor: theme.colors.background,
  };

  const originLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 20,
  };

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
      contentContainerStyle={contentStyle}
      hideFooterOnKeyboard={false}
      footer={
        <>
          {/* Solid backing panel behind the floating Total + CTA. */}
          <View style={[floatingBackdropStyle, { pointerEvents: 'none' }]} />
          {/* Floating Total — pinned just above the CTA. */}
          <View style={floatingTotalStyle}>
            <TotalRow totalCents={total} />
          </View>
          <FloatingButton
            label="Revisar Pedido"
            onPress={handleReview}
            disabled={!canReview}
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
