import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, type ViewStyle } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { EditOrderItemsScreen } from '../src/screens/EditOrderItemsScreen';
import { Screen } from '../src/components';
import { Text } from '../src/components/Typography';
import { Header } from '../src/components/Layout';
import { useTheme } from '../src/theme/ThemeProvider';
import { apiClient } from '../src/services/api-client';
import type { Order } from '@order-system/shared';

/**
 * Route: /edit-order-items
 * Opens the Edit Order Items screen for a given order.
 *
 * Usage: router.push({ pathname: '/edit-order-items', params: { orderId: 'xxx' } })
 *
 * Route params:
 * - orderId: string — the order to edit items for
 */
export default function EditOrderItemsRoute() {
  const theme = useTheme();
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
    padding: 32,
  };

  if (loading) {
    return (
      <Screen padding={false}>
        <Header title="Editar Itens" icon="edit" />
        <View style={centerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !order) {
    return (
      <Screen padding={false}>
        <Header title="Editar Itens" icon="edit" />
        <View style={centerStyle}>
          <Text size="lg" color={theme.colors.error}>
            {error ?? 'Pedido não encontrado'}
          </Text>
        </View>
      </Screen>
    );
  }

  return <EditOrderItemsScreen orderId={orderId!} order={order} />;
}
