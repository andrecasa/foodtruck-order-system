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
 * Route: /(tabs)/edit-order-items
 * Opens the Edit Order Items screen for a given order.
 *
 * Lives inside the (tabs) group (hidden via href:null in the tabs layout) so it
 * inherits the shared bottom tab bar instead of rendering a custom one.
 *
 * Usage: router.push({ pathname: '/(tabs)/edit-order-items', params: { orderId: 'xxx' } })
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
    let cancelled = false;

    // Reset state when the orderId changes. This route stays mounted across
    // tab navigations, so without resetting we'd briefly show the previous
    // order while the new one loads.
    setOrder(null);
    setError(null);
    setLoading(true);

    async function loadOrder() {
      if (!orderId) {
        if (!cancelled) {
          setError('ID do pedido não informado');
          setLoading(false);
        }
        return;
      }

      try {
        const orders = await apiClient.getOrders({});
        const found = orders.find((o) => o.id === orderId);
        if (cancelled) return;
        if (!found) {
          setError('Pedido não encontrado');
        } else {
          setOrder(found);
        }
      } catch {
        if (!cancelled) setError('Erro ao carregar pedido');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOrder();
    return () => { cancelled = true; };
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

  // Key by orderId so the screen fully remounts (with fresh form state) when
  // editing a different order. Tab-group screens stay mounted across
  // navigations, so without this the previous order's customerName/origin/items
  // would leak into the next edit.
  return <EditOrderItemsScreen key={orderId} orderId={orderId!} order={order} />;
}
