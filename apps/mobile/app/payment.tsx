import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { PaymentScreen } from '../src/screens/PaymentScreen';
import { Screen, Text } from '../src/components';
import { useTheme } from '../src/theme/ThemeProvider';
import { apiClient } from '../src/services/api-client';
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

  useFocusEffect(
    useCallback(() => {
      async function loadOrder() {
        if (!orderId) {
          setError('ID do pedido não informado');
          setLoading(false);
          return;
        }

        try {
          setLoading(true);
          const found = await apiClient.getOrderById(orderId);
          setOrder(found);
          setError(null);
        } catch {
          setError('Pedido não encontrado');
        } finally {
          setLoading(false);
        }
      }

      loadOrder();
    }, [orderId])
  );

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
        router.back();
      }}
    />
  );
}
