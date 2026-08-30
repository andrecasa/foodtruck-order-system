import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Heading, Input, Text } from '../../components';
import { OrderSummary } from '../../components/customer/OrderSummary';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { formatPrice } from '../../utils/format';
import { useCart } from '../../hooks/customer/useCart';
import { useCreateOrder } from '../../hooks/customer/useCreateOrder';

export interface CustomerCheckoutScreenProps {
  /** Tenant slug from the route (`/:slug/checkout`). */
  slug: string;
}

/**
 * Checkout / confirmation screen (`/:slug/checkout`).
 *
 * Reviews the cart via `OrderSummary`, collects the customer's name (required,
 * client-side validated), and confirms the order through `useCreateOrder`. On
 * success it clears the cart and navigates to the tracking screen. On error it
 * shows a friendly message and keeps the cart intact so the customer can retry.
 */
export function CustomerCheckoutScreen({ slug }: CustomerCheckoutScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const cart = useCart(slug);
  const { submit, isSubmitting, error, reset } = useCreateOrder(slug);

  const [customerName, setCustomerName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const isEmpty = cart.items.length === 0;

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
      cart.clear();
      // The order is recorded into the session "Meus pedidos" list by the
      // tracking screen (it has the full order), so we just navigate there.
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
    padding: theme.spacing.md,
    gap: theme.spacing.lg,
    // Leave room for the fixed informative bottom bar, matching the tracking
    // screen's bottom bar clearance.
    paddingBottom: theme.spacing.xl * 3,
  };

  // ─── Bottom bar (total + confirm) — mirrors the tracking screen's bar. ──────
  const itemCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  const bottomBarStyle: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  };

  const bottomBarLeftStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  };

  const barIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.surface,
  };

  const barCountBadgeStyle: ViewStyle = {
    minWidth: theme.spacing.lg,
    height: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const barCountTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.xs,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.primary,
  };

  const barLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.surface,
  };

  const barTotalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.surface,
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

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      <CustomerHeader
        title="Confirmar Pedido"
        onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
      />

      <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator>
        
        <Input
          label="Seu nome"
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
        
        <View>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Itens</Heading>
          </View>
          <OrderSummary
            testID="checkout-summary"
            showTotal={false}
            lines={cart.items.map((i) => ({
              key: i.menuItemId,
              name: i.name,
              quantity: i.quantity,
              unitPriceCents: i.priceCents,
            }))}
            totalCents={cart.total}
          />
        </View>



        {error ? (
          <View testID="checkout-error" style={{ gap: theme.spacing.sm }}>
            <Text color={theme.colors.error} align="center">
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          title={isSubmitting ? 'Enviando...' : 'Confirmar Pedido'}
          variant="primary"
          size="lg"
          fullWidth
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleConfirm}
          testID="checkout-confirm-button"
        />
      </ScrollView>

      {/* Fixed informative bottom bar — total only, mirroring the tracking screen. */}
      <View
        style={bottomBarStyle}
        accessibilityLabel={`Pedido com ${itemCount} ${
          itemCount === 1 ? 'item' : 'itens'
        }, total ${formatPrice(cart.total)}`}
        testID="checkout-total-bar"
      >
        <View style={bottomBarLeftStyle}>
          <RNText style={barIconStyle}>shopping_cart</RNText>
          <View style={barCountBadgeStyle}>
            <RNText style={barCountTextStyle}>{itemCount}</RNText>
          </View>
          <RNText style={barLabelStyle}>Total do pedido</RNText>
        </View>
        <RNText style={barTotalStyle} testID="checkout-total">
          {formatPrice(cart.total)}
        </RNText>
      </View>
    </SafeAreaView>
  );
}
