import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Heading, Input, Text, MenuItemsCard, FloatingButton, OrderSummaryCard } from '../../components';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { useCart } from '../../hooks/customer/useCart';
import { useCreateOrder } from '../../hooks/customer/useCreateOrder';
import { getCurrentCoordinates } from '../../services/geolocation';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';
import { ordersHref, qrcodeHref, menuHref } from '../../components/customer/customerNavHref';

export interface CustomerCheckoutScreenProps {
  /** Tenant slug from the route (`/:slug/checkout`). */
  slug: string;
}

/**
 * Checkout / confirmation screen (`/:slug/checkout`) — "Confirmar Pedido".
 *
 * Matches the Penpot "Clientes - Carrinho" board: a back app bar, a "Resumo"
 * card (payment-style text with a colored left stripe), an "Itens do Pedido"
 * card sharing the "Novo Pedido" stepper (via `MenuItemsCard`; decrementing to
 * 0 removes the line), a Total row, and a floating "Confirmar Pedido" CTA. The
 * customer name is
 * required (client-side validated) and may be prefilled from the menu screen
 * via the `name` route param. On success it clears the cart and navigates to
 * "Meus Pedidos" (`/:slug/orders`); on error it keeps the cart intact so the
 * customer can retry.
 * A customer bottom nav (Novo / Pedidos) is pinned at the bottom.
 */
export function CustomerCheckoutScreen({ slug }: CustomerCheckoutScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const cart = useCart(slug);
  const { submit, isSubmitting, error, reset } = useCreateOrder(slug);
  const { addOrder } = useSessionOrders(slug);

  const [customerName, setCustomerName] = useState(
    typeof params.name === 'string' ? params.name : '',
  );
  const [nameError, setNameError] = useState<string | null>(null);

  const isEmpty = cart.items.length === 0;

  // itemId → quantity, for the shared MenuItemsCard stepper.
  const cartQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const line of cart.items) map[line.menuItemId] = line.quantity;
    return map;
  }, [cart.items]);

  const handleConfirm = async () => {
    const trimmed = customerName.trim();
    if (trimmed.length === 0) {
      setNameError('Informe seu nome para confirmar o pedido.');
      return;
    }
    if (trimmed.length > 100) {
      setNameError('O nome deve ter no máximo 100 caracteres.');
      return;
    }
    setNameError(null);
    reset();

    // Captura opcional da localização: se o cliente negar a permissão (ou não
    // estiver disponível), `coords` é null e o pedido segue sem coordenadas.
    const coords = await getCurrentCoordinates();

    const order = await submit({
      customerName: trimmed,
      items: cart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
      ...(coords ?? {}),
    });

    if (order) {
      // Record the placed order into the session list at creation time so
      // "Meus Pedidos" accumulates EVERY order — not just the last one the
      // customer happened to open on the tracking screen.
      addOrder({
        id: order.id,
        dailyNumber: order.dailyNumber,
        customerName: order.customerName,
        status: order.status,
      });
      cart.clear();
      router.replace(ordersHref(slug));
    }
  };

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const contentStyle: ViewStyle = {
    paddingHorizontal: theme.spacing.md,
    // Top padding handled by the fixed name bar above; keep a small gap here.
    paddingTop: theme.spacing.xs,
    gap: theme.spacing.lg,
    // Room so the last content clears the floating "Confirmar Pedido" CTA.
    paddingBottom: 16 + 44 + 16,
  };

  // Fixed name bar below the header — matches the content horizontal padding.
  const nameBarStyle: ViewStyle = {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  };

  const centeredStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  };

  // Empty cart guard (e.g. reached checkout directly or after a clear).
  if (isEmpty) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
        <View style={centeredStyle} testID="checkout-empty">
          <Text align="center" color={theme.colors.textSecondary}>
            Seu carrinho está vazio.
          </Text>
          <Button
            title="Voltar ao cardápio"
            variant="primary"
            onPress={() => router.replace(menuHref(slug))}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      {/* Tela empilhada (push a partir do menu): a seta volta com router.back(). */}
      <CustomerHeader title="Confirmar Pedido" onBack={() => router.back()} />

      <View style={{ flex: 1 }}>
      {/* Fixed name bar — stays visible above the scrollable resumo/items. */}
      <View style={nameBarStyle}>
        <Input
          icon="person"
          accessibilityLabel="Seu nome"
          placeholder="Como devemos chamar você?"
          value={customerName}
          onChangeText={(text) => {
            setCustomerName(text);
            if (nameError) setNameError(null);
          }}
          error={nameError ?? undefined}
          autoCapitalize="words"
          testID="checkout-name-input"
        />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {/* Resumo — name + items + total, framed with a colored left stripe. */}
        <View>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Resumo</Heading>
          </View>
          <OrderSummaryCard
            customerName={customerName}
            items={cart.items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              priceCents: i.priceCents,
            }))}
            totalCents={cart.total}
            testID="checkout-resumo"
            contentTestID="checkout-summary"
            totalTestID="checkout-total"
          />
        </View>

        {/* Editable items — standardized with the "Novo Pedido" card: shared
            steppers (same colors), no per-line total, no remove icon.
            Decrementing to 0 removes the line. */}
        <View>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Itens do Pedido</Heading>
          </View>
          <MenuItemsCard
            category="Itens do Pedido"
            hideCategoryLabel
            items={cart.items.map((i) => ({
              id: i.menuItemId,
              name: i.name,
              priceCents: i.priceCents,
            }))}
            quantities={cartQuantities}
            onIncrement={(id) => {
              const line = cart.items.find((i) => i.menuItemId === id);
              if (line) cart.updateQuantity(id, line.quantity + 1);
            }}
            onDecrement={(id) => {
              const line = cart.items.find((i) => i.menuItemId === id);
              if (line) cart.updateQuantity(id, line.quantity - 1); // 0 removes the line
            }}
          />
        </View>

        {error ? (
          <View testID="checkout-error" style={{ gap: theme.spacing.sm }}>
            <Text color={theme.colors.error} align="center">
              {error}
            </Text>
          </View>
        ) : null}

      </ScrollView>

      {/* Floating CTA — pinned above the bottom nav. */}
      <FloatingButton
        label={isSubmitting ? 'Enviando...' : 'Confirmar Pedido'}
        onPress={handleConfirm}
        disabled={isSubmitting}
        bottomOffset={16}
        testID="checkout-confirm-button"
      />
      </View>

      <CustomerBottomNav
        slug={slug}
        active="novo"
        qrcodeHref={qrcodeHref(slug)}
        pedidosHref={ordersHref(slug)}
      />
    </SafeAreaView>
  );
}
