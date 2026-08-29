import React, { useState } from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Heading, Input, Text } from '../../components';
import { OrderSummary } from '../../components/customer/OrderSummary';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
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
        <View>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Resumo</Heading>
          </View>
          <OrderSummary
            testID="checkout-summary"
            lines={cart.items.map((i) => ({
              key: i.menuItemId,
              name: i.name,
              quantity: i.quantity,
              unitPriceCents: i.priceCents,
            }))}
            totalCents={cart.total}
          />
        </View>

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
    </SafeAreaView>
  );
}
