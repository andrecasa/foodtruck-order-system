import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { PublicMenuItem } from '@order-system/shared';
import { useTheme } from '../../theme';
import { Button, Text, MenuItemsCard, TotalRow, FloatingButton } from '../../components';
import { usePublicMenu } from '../../hooks/customer/usePublicMenu';
import { useCart } from '../../hooks/customer/useCart';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { ordersHref, homeHref } from '../../components/customer/customerNavHref';

export interface CustomerMenuScreenProps {
  /** Tenant slug from the route (`/:slug`). */
  slug: string;
  /** Business name resolved from branding (kept for API compatibility). */
  businessName?: string;
}

/**
 * Public customer menu screen (`/:slug`) — "Novo Pedido".
 *
 * Matches the Penpot "Clientes - Novo Pedido" board: a centered "Novo Pedido"
 * app bar, the customer name field, the menu grouped by category (each item
 * with an inline `− qtd +` stepper via the shared `MenuItemsCard`), a Total
 * row, and a primary "Criar Pedido" button that carries the typed name into
 * checkout. A customer-specific bottom nav (Novo / Pedidos) is pinned at the
 * bottom.
 *
 * The list of orders placed this session lives on the "Pedidos" screen, so this
 * screen has no order list and no realtime subscription.
 */
export function CustomerMenuScreen({ slug }: CustomerMenuScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { categories, isLoading, error, refetch } = usePublicMenu(slug);
  const cart = useCart(slug);

  // Flat lookup of every menu item by id, so the id-based stepper handlers
  // (from the shared MenuItemsCard) can resolve the full item for the cart.
  const itemsById = useMemo(() => {
    const map: Record<string, PublicMenuItem> = {};
    for (const category of categories) {
      for (const item of category.items) map[item.id] = item;
    }
    return map;
  }, [categories]);

  // Quantity per item currently in the cart, for the inline − qtd + stepper.
  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of cart.items) map[line.menuItemId] = line.quantity;
    return map;
  }, [cart.items]);

  const handleIncrementItem = (id: string) => {
    const current = quantities[id] ?? 0;
    if (current === 0) {
      const item = itemsById[id];
      if (item) cart.addItem(item, 1);
      return;
    }
    cart.updateQuantity(id, current + 1);
  };

  const handleDecrementItem = (id: string) => {
    const current = quantities[id] ?? 0;
    cart.updateQuantity(id, current - 1); // qty <= 0 removes the line
  };

  // Proceed to checkout, carrying the typed name so checkout can prefill it.
  // The customer name is collected on the checkout screen, so this just
  // proceeds to confirmation.
  const handleCreateOrder = () => {
    router.push(`/${encodeURIComponent(slug)}/checkout`);
  };

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const centeredStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  };

  const scrollContentStyle: ViewStyle = {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.lg,
    // Room so the last content clears the floating Total (48) + CTA (44) stack.
    paddingBottom: 16 + 44 + 8 + 48 + 16,
  };

  // Floating Total container — pinned just above the CTA (which sits at
  // bottom:16, height 44), so the total floats at 16 + 44 + 8. Uses the opaque
  // `surfacePrimary` tint (matches the TotalRow look) so scrolled content does
  // not bleed through the translucent row.
  const floatingTotalStyle: ViewStyle = {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16 + 44 + 8,
    backgroundColor: theme.colors.surfacePrimary,
    borderRadius: 8,
  };

  // "Itens do Pedido" section title — matches operator Novo Pedido
  // (14px / weight 400 / color text).
  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  // ─── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={safeAreaStyle}>
        <View style={centeredStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <View style={{ marginTop: theme.spacing.sm }}>
            <Text color={theme.colors.textSecondary}>Carregando cardápio...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={safeAreaStyle}>
        <View style={centeredStyle} testID="menu-error">
          <Text align="center" color={theme.colors.error}>
            {error.message}
          </Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button title="Tentar novamente" variant="primary" onPress={refetch} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isEmptyMenu = categories.length === 0;

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      <CustomerHeader title="Novo Pedido" />

      <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={scrollContentStyle}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {isEmptyMenu ? (
          <View style={{ paddingVertical: theme.spacing.lg * 2, alignItems: 'center' }}>
            <Text color={theme.colors.textSecondary}>
              Nenhum item disponível no momento.
            </Text>
          </View>
        ) : (
          <View>
            {/* Section title above categories — matches operator Novo Pedido. */}
            <Text style={sectionTitleStyle}>Itens do Pedido</Text>
            {categories.map((category) => (
              <MenuItemsCard
                key={`${category.name}-${category.sortOrder}`}
                category={category.name}
                items={category.items.map((item) => ({
                  id: item.id,
                  name: item.name,
                  priceCents: item.priceCents,
                }))}
                quantities={quantities}
                onIncrement={handleIncrementItem}
                onDecrement={handleDecrementItem}
                showAddButton
              />
            ))}
          </View>
        )}

      </ScrollView>

      {/* Floating Total — pinned just above the CTA. */}
      <View style={floatingTotalStyle}>
        <TotalRow totalCents={cart.total} testID="menu-total-row" />
      </View>

      {/* Floating CTA — pinned above the bottom nav. */}
      <FloatingButton
        label="Criar Pedido"
        onPress={handleCreateOrder}
        disabled={cart.count === 0}
        bottomOffset={16}
        testID="menu-create-order-button"
      />
      </View>

      <CustomerBottomNav
        slug={slug}
        active="novo"
        homeHref={homeHref(slug)}
        pedidosHref={ordersHref(slug)}
      />
    </SafeAreaView>
  );
}
