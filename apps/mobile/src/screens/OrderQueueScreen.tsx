import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, TouchableOpacity, Text as RNText, View, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import type { Order, OrderStatus, PaymentStatus } from '@order-system/shared';
import {
  Screen,
  Header,
  ScrollContainer,
  Button,
  Text,
  FilterChips,
  type FilterChipOption,
} from '../components';
import { Toast } from '../components/Toast';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';
import { useNetworkError } from '../hooks/useNetworkError';
import { useAuth } from '../hooks/useAuth';

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

/** Icon for the CTA button (next status icon) */
const ADVANCE_ICON: Record<OrderStatus, string> = {
  aguardando: 'local_fire_department',
  preparando: 'notifications',
  pronto: 'check_circle',
  entregue: '',
};

/** Icon for status badge */
const STATUS_ICON: Record<OrderStatus, string> = {
  aguardando: 'schedule',
  preparando: 'local_fire_department',
  pronto: 'notifications',
  entregue: 'check_circle',
};

/** Icon for origin badge */
const ORIGIN_ICON: Record<string, string> = {
  presencial: 'storefront',
  whatsapp: 'chat',
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
  const { isAuthenticated } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(DEFAULT_FILTERS);
  const { error: networkError, dismiss: dismissError, withRetry } = useNetworkError();

  /** Filter chip options — colors and icons match Penpot status palette */
  const filterOptions: FilterChipOption[] = [
    { key: 'aguardando', label: 'Aguardando', color: theme.colors.aguardando, icon: 'schedule' },
    { key: 'preparando', label: 'Preparando', color: theme.colors.preparando, icon: 'local_fire_department' },
    { key: 'pronto', label: 'Pronto', color: theme.colors.pronto, icon: 'notifications' },
    { key: 'entregue', label: 'Entregue', color: theme.colors.textSecondary, icon: 'check_circle' },
  ];

  const fetchOrders = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await apiClient.getOrders({
        status: selectedFilters as OrderStatus[],
      });

      // Sort delivered orders by deliveredAt descending
      if (selectedFilters.includes('entregue') && selectedFilters.length === 1) {
        data.sort((a, b) => {
          const aTime = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
          const bTime = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
          return bTime - aTime;
        });
      }

      setOrders(data);
    } catch {
      // Silently handle — toast shown via withRetry when used
    } finally {
      setLoading(false);
    }
  }, [selectedFilters, isAuthenticated]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Refetch orders when screen regains focus (e.g., after payment modal closes)
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [fetchOrders])
  );

  // Realtime: subscribe to order events for live updates
  const realtimeChannels = useMemo(() => ['orders:queue', 'orders:payment'], []);

  useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback((_event) => {
      // Refetch orders on any realtime event (new order, status change, payment)
      fetchOrders();
    }, [fetchOrders]),
    onReconnect: useCallback(() => {
      // Reload data after reconnection
      fetchOrders();
    }, [fetchOrders]),
  });

  const handleAdvanceStatus = async (order: Order) => {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;

    setAdvancingId(order.id);
    try {
      await withRetry(() => apiClient.updateOrderStatus(order.id, { status: nextStatus }));
      await fetchOrders();
    } catch {
      // Error shown via withRetry toast
    } finally {
      setAdvancingId(null);
    }
  };

  const handleCardPress = (order: Order) => {
    router.push({ pathname: '/(tabs)/payment', params: { orderId: order.id } });
  };

  const formatCurrency = (cents: number): string => {
    return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
  };

  // Styles using theme tokens
  const loadingContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  };

  const contentGapStyle: ViewStyle = {
    gap: 12,
  };

  const emptyContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  };

  // --- Order Card styles ---

  const getStatusColor = (status: OrderStatus): string => {
    switch (status) {
      case 'aguardando': return theme.colors.aguardando;
      case 'preparando': return theme.colors.preparando;
      case 'pronto': return theme.colors.pronto;
      case 'entregue': return theme.colors.textSecondary;
    }
  };

  const getPaymentColor = (payStatus: PaymentStatus): string => {
    return payStatus === 'pago' ? theme.colors.success : theme.colors.error;
  };

  const renderOrderCard = (order: Order) => {
    const statusColor = getStatusColor(order.status);
    const payColor = getPaymentColor(order.paymentStatus);
    const nextStatus = NEXT_STATUS[order.status];
    const isAdvancing = advancingId === order.id;
    const showButton = !!nextStatus;

    // Time since order creation
    const createdAt = new Date(order.createdAt);
    const totalMinutes = Math.floor((Date.now() - createdAt.getTime()) / 60000);
    let timeLabel: string;
    if (totalMinutes < 1) {
      timeLabel = 'Agora';
    } else if (totalMinutes < 60) {
      timeLabel = `Pedido criado há ${totalMinutes} min`;
    } else {
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      timeLabel = mins > 0 ? `Pedido criado há ${hours}h ${mins}min` : `Pedido criado há ${hours}h`;
    }

    return (
      <View
        key={order.id}
        accessibilityLabel={`Pedido ${order.dailyNumber}, ${order.customerName}, status ${order.status}`}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: statusColor + '40',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {/* Left stripe */}
        <View style={{ width: 5, backgroundColor: statusColor, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />

        {/* Content */}
        <View style={{ flex: 1, padding: 12, gap: 8 }}>
          {/* Tappable info area — navigates to payment details */}
          <Pressable
            onPress={() => handleCardPress(order)}
            accessibilityRole="link"
            accessibilityHint="Toque para abrir detalhes do pedido"
            style={{ gap: 8 }}
          >
            {/* Line 1: Badges — Pagamento | Origem | Status */}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {/* Payment badge */}
              <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', backgroundColor: payColor + '1F', borderRadius: 11, paddingHorizontal: 8, height: 22 }}>
                <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 12, color: payColor }}>currency_exchange</RNText>
                <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 10, color: payColor }}>
                  {order.paymentStatus === 'pago' ? 'Pago' : 'Pendente'}
                </RNText>
              </View>
              {/* Origin badge */}
              <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', backgroundColor: theme.colors.primary + '14', borderRadius: 11, paddingHorizontal: 8, height: 22 }}>
                <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 12, color: theme.colors.primary }}>{ORIGIN_ICON[order.origin] || 'storefront'}</RNText>
                <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 10, color: theme.colors.primary }}>
                  {order.origin === 'whatsapp' ? 'WhatsApp' : 'Presencial'}
                </RNText>
              </View>
              {/* Status badge */}
              <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', backgroundColor: statusColor + '1F', borderRadius: 11, paddingHorizontal: 8, height: 22 }}>
                <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 12, color: statusColor }}>{STATUS_ICON[order.status]}</RNText>
                <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 10, color: statusColor }}>
                  {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </RNText>
              </View>
            </View>

            {/* Line 2: Name */}
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 16, fontWeight: '600', color: theme.colors.text }}>
              #{order.dailyNumber} - {order.customerName}
            </RNText>

            {/* Line 3: Items */}
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 12, fontWeight: '400', color: theme.colors.text }}>
              {order.items.map(item => `${item.quantity}x ${item.name}`).join(' • ')}
            </RNText>

            {/* Line 4: Price */}
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 16, fontWeight: '600', color: theme.colors.text }}>
              {formatCurrency(order.totalAmount)}
            </RNText>

            {/* Line 5: Time */}
            <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
              <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 14, color: theme.colors.textSecondary, opacity: 0.7 }}>timer</RNText>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 11, color: theme.colors.textSecondary, opacity: 0.7 }}>{timeLabel}</RNText>
            </View>
          </Pressable>

          {/* Line 6: CTA Button (separate from tappable area) */}
          {showButton && (
            <TouchableOpacity
              onPress={() => handleAdvanceStatus(order)}
              disabled={isAdvancing}
              activeOpacity={0.7}
              style={{
                height: 36,
                borderRadius: 18,
                backgroundColor: statusColor,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: isAdvancing ? 0.7 : 1,
              }}
              accessibilityRole="button"
              accessibilityLabel={ADVANCE_LABEL[order.status]}
              testID={`advance-${order.id}`}
            >
              {isAdvancing ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <>
                  <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 16, color: theme.colors.surface }}>{ADVANCE_ICON[order.status]}</RNText>
                  <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 13, color: theme.colors.surface }}>{ADVANCE_LABEL[order.status]}</RNText>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <Screen>
        <Header title="Fila de Pedidos" icon="receipt_long" />
        <Toast message={networkError.message} visible={networkError.visible} onDismiss={dismissError} />
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
        <Toast message={networkError.message} visible={networkError.visible} onDismiss={dismissError} />
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
      <Toast message={networkError.message} visible={networkError.visible} onDismiss={dismissError} />
      <ScrollContainer style={contentGapStyle}>
        {/* Status Filter (Penpot: row of tinted chips, gap 8px) */}
        <FilterChips
          options={filterOptions}
          selected={selectedFilters}
          onSelectionChange={setSelectedFilters}
          testID="status-filter"
        />

        {orders.map((order) => renderOrderCard(order))}
      </ScrollContainer>
    </Screen>
  );
}
