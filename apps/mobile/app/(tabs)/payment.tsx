import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PaymentScreen } from '../../src/screens/PaymentScreen';
import { Screen, Text } from '../../src/components';
import { useTheme } from '../../src/theme/ThemeProvider';
import { apiClient } from '../../src/services/api-client';
import type { Order } from '@order-system/shared';

/**
 * Payment modal route — opened from OrderQueueScreen with an order ID.
 * Uses useLocalSearchParams() to receive the orderId, then fetches the order
 * and passes it to PaymentScreen.
 *
 * Usage: router.push({ pathname: '/payment', params: { orderId: 'xxx' } })
 */
export default function PaymentRoute() {
  const theme = useTheme();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) {
        setError('ID do pedido não informado');
        setLoading(false);
        return;
      }

      try {
        const orders = await apiClient.getOrders({});
        const found = orders.find((o) => o.id === orderId);
        if (!found) {
          setError('Pedido não encontrado');
        } else {
          setOrder(found);
        }
      } catch {
        setError('Erro ao carregar pedido');
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [orderId]);

  const centerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  };

  if (loading) {
    return (
      <Screen>
        <View style={centerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !order) {
    return (
      <Screen>
        <View style={centerStyle}>
          <Text size="lg" color={theme.colors.error}>
            {error ?? 'Pedido não encontrado'}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <PaymentScreen
      order={order}
      onPaymentSuccess={() => {
        // Small delay to let user see success state before navigating back
        setTimeout(() => router.back(), 1500);
      }}
    />
  );
}
