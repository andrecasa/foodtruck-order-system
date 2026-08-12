import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text as RNText, View, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Order, OrderStatus } from '@order-system/shared';
import {
  Screen,
  Header,
  ScrollContainer,
  Card,
  Badge,
  Button,
  Text,
  OriginBadge,
  FilterChips,
  type BadgeStatus,
  type FilterChipOption,
} from '../components';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';

/** Map current status to the next status in the workflow */
const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  aguardando: 'preparando',
  preparando: 'pronto',
  pronto: 'entregue',
  entregue: null,
};

/** Label for the advance button based on current status (matches Penpot exactly) */
const ADVANCE_LABEL: Record<OrderStatus, string> = {
  aguardando: 'Iniciar Preparo',
  preparando: 'Marcar Pronto',
  pronto: 'Marcar Entregue',
  entregue: '',
};

/**
 * Order Queue Screen — displays active orders (aguardando, preparando, pronto)
 * as cards sorted by createdAt (oldest first).
 *
 * Includes a FilterChips row at the top to toggle visible statuses.
 * By default: aguardando, preparando, pronto are active; entregue is hidden.
 *
 * Each card shows: daily number, customer name, origin, items, status badge,
 * and an action button to advance the order status.
 */

/** Default active filters — hides entregue */
const DEFAULT_FILTERS: OrderStatus[] = ['aguardando', 'preparando', 'pronto'];

export function OrderQueueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(DEFAULT_FILTERS);

  /** Filter chip options — colors match Penpot status palette */
  const filterOptions: FilterChipOption[] = [
    { key: 'aguardando', label: 'Aguardando', color: theme.colors.aguardando },
    { key: 'preparando', label: 'Preparando', color: theme.colors.preparando },
    { key: 'pronto', label: 'Pronto', color: theme.colors.pronto },
    { key: 'entregue', label: 'Entregue', color: theme.colors.textSecondary ?? '#8B6B5A' },
  ];

  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiClient.getOrders({
        status: selectedFilters as OrderStatus[],
      });
      setOrders(data);
    } catch {
      // Silently handle — in production, show a toast/error banner
    } finally {
      setLoading(false);
    }
  }, [selectedFilters]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Refetch orders when screen regains focus (e.g., after payment modal closes)
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  const handleAdvanceStatus = async (order: Order) => {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;

    setAdvancingId(order.id);
    try {
      await apiClient.updateOrderStatus(order.id, { status: nextStatus });
      await fetchOrders();
    } catch {
      // Silently handle — in production, show error feedback
    } finally {
      setAdvancingId(null);
    }
  };

  const handleCardPress = (order: Order) => {
    router.push({ pathname: '/payment', params: { orderId: order.id } });
  };

  const formatCurrency = (cents: number): string => {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  };

  // Styles using theme tokens — matched to Penpot Content area (padding 16px, gap 12px)
  const loadingContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  };

  const contentGapStyle: ViewStyle = {
    gap: 12,
  };

  const cardHeaderStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const itemsTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.text,
    lineHeight: 18,
  };

  const priceTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  };

  const emptyContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  };

  if (loading) {
    return (
      <Screen>
        <Header title="Fila de Pedidos" icon="receipt_long" />
        <View style={loadingContainerStyle} accessibilityLabel="Carregando pedidos">
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text size="md" style={{ marginTop: theme.spacing.sm }}>
            Carregando pedidos...
          </Text>
        </View>
      </Screen>
    );
  }

  if (orders.length === 0 && !loading) {
    return (
      <Screen padding={false}>
        <Header title="Fila de Pedidos" icon="receipt_long" />
        <ScrollContainer style={contentGapStyle}>
          <FilterChips
            options={filterOptions}
            selected={selectedFilters}
            onSelectionChange={setSelectedFilters}
            testID="status-filter"
          />
          <View style={emptyContainerStyle}>
            <Text size="lg" align="center">
              Nenhum pedido na fila no momento.
            </Text>
          </View>
        </ScrollContainer>
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      <Header title="Fila de Pedidos" icon="receipt_long" />
      <ScrollContainer style={contentGapStyle}>
        {/* Status Filter (Penpot: row of tinted chips, gap 8px) */}
        <FilterChips
          options={filterOptions}
          selected={selectedFilters}
          onSelectionChange={setSelectedFilters}
          testID="status-filter"
        />

        {orders.map((order) => {
          const cardVariant =
            order.status === 'aguardando' || order.status === 'preparando' || order.status === 'pronto'
              ? order.status
              : 'default';

          const nextStatus = NEXT_STATUS[order.status];
          const isAdvancing = advancingId === order.id;
          const showButton = !!nextStatus;

          // Button color matches Penpot: aguardando → primary, preparando → blue, pronto → green
          const getButtonColor = (): string | undefined => {
            switch (order.status) {
              case 'preparando':
                return theme.colors.preparando;
              case 'pronto':
                return theme.colors.pronto;
              default:
                return undefined; // uses primary by default
            }
          };

          return (
            <Card
              key={order.id}
              variant={cardVariant}
              onPress={() => handleCardPress(order)}
              accessibilityLabel={`Pedido ${order.dailyNumber}, ${order.customerName}, status ${order.status}`}
              accessibilityHint="Toque para abrir pagamento"
            >
              {/* Card Header: "#1 — Nome" + Badge (Penpot format) */}
              <View style={cardHeaderStyle}>
                <Text
                  size="lg"
                  weight="medium"
                >
                  #{order.dailyNumber} — {order.customerName}
                </Text>
                <Badge status={order.status as BadgeStatus} size="sm" />
              </View>

              {/* Origin badge (Penpot: tinted pill badge) */}
              <OriginBadge origin={order.origin} />

              {/* Items List (Penpot: 13px weight 400, #3D2020) */}
              <RNText style={itemsTextStyle}>
                {order.items.map((item) => `${item.quantity}x ${item.name}`).join('\n')}
              </RNText>

              {/* Price (Penpot: 18px weight 600, no "Total:" prefix) */}
              <RNText style={priceTextStyle}>
                {formatCurrency(order.totalAmount)}
              </RNText>

              {/* Action Button (Penpot: sm, auto-width) */}
              {showButton && (
                <Button
                  title={ADVANCE_LABEL[order.status]}
                  variant="primary"
                  size="sm"
                  color={getButtonColor()}
                  onPress={() => handleAdvanceStatus(order)}
                  loading={isAdvancing}
                  disabled={isAdvancing}
                  testID={`advance-${order.id}`}
                />
              )}
            </Card>
          );
        })}
      </ScrollContainer>
    </Screen>
  );
}
