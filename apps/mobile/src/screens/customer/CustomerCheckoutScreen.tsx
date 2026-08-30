import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Heading, Input, Text, MenuItemsCard, FloatingButton } from '../../components';
import { formatPrice } from '../../utils/format';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { useCart } from '../../hooks/customer/useCart';
import { useCreateOrder } from '../../hooks/customer/useCreateOrder';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';
import { ordersHref } from '../../components/customer/customerNavHref';

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
 * tracking; on error it keeps the cart intact so the customer can retry.
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

    const order = await submit({
      customerName: trimmed,
      items: cart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
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
      router.replace(
        `/${encodeURIComponent(slug)}/pedido/${encodeURIComponent(order.id)}`,
      );
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

  // Full-width solid panel behind the floating CTA so no scrolled content
  // shows through. Uses the screen background, matching the fixed name bar.
  const floatingBackdropStyle: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 16 + 44 + 8,
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
            onPress={() => router.replace(`/${encodeURIComponent(slug)}`)}
          />
        </View>
      </SafeAreaView>
    );
  }

  // "Resumo" card: payment-card text (bold name line + compact items block),
  // framed with a status-colored left stripe (primary), matching the operator
  // PaymentScreen card. The grand total lives in the Total row below, not here.
  const resumoFrameStyle: ViewStyle = {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  };

  const resumoStripeStyle: ViewStyle = {
    width: 5,
    backgroundColor: theme.colors.primary,
  };

  // Payment-card text styles (operator PaymentScreen): bold name line + a
  // compact single-block items list.
  const resumoNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  };

  const resumoItemsStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
    lineHeight: 18,
  };

  // Total line inside the Resumo card — bold, matching the operator payment card.
  const resumoTotalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  };

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      <CustomerHeader
        title="Confirmar Pedido"
        onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
      />

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
          <View style={resumoFrameStyle} testID="checkout-resumo">
            <View style={resumoStripeStyle} />
            <View
              style={{
                flex: 1,
                padding: theme.spacing.md,
                gap: theme.spacing.sm,
              }}
              testID="checkout-summary"
            >
              {/* Name line — matches the operator payment card (16px / 600). */}
              {customerName.trim().length > 0 ? (
                <RNText style={resumoNameStyle}>{customerName.trim()}</RNText>
              ) : null}

              {/* Items — one text block, "Nx Name (line total)" per line,
                  identical to the payment card (12px / 400). No total here;
                  the Total row below owns the grand total. */}
              <RNText style={resumoItemsStyle}>
                {cart.items
                  .map((i) => `${i.quantity}x ${i.name} (${formatPrice(i.priceCents * i.quantity)})`)
                  .join('\n')}
              </RNText>

              {/* Total inside the card — bold line, matching the operator
                  payment card. */}
              <RNText style={resumoTotalStyle} testID="checkout-total">
                {formatPrice(cart.total)}
              </RNText>
            </View>
          </View>
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

      {/* Solid backing panel behind the floating CTA. */}
      <View style={floatingBackdropStyle} pointerEvents="none" />

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
        pedidosHref={ordersHref(slug)}
      />
    </SafeAreaView>
  );
}
