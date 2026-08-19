import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DateChip } from '../components/DateChip';
import { CalendarModal } from '../components/CalendarModal';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';
import { useNetworkError } from '../hooks/useNetworkError';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useAuth } from '../hooks/useAuth';
import { formatPrice } from '../utils/format';

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

/** All status filters — used when viewing past dates */
const ALL_FILTERS: OrderStatus[] = ['aguardando', 'preparando', 'pronto', 'entregue'];

export function OrderQueueScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { isOffline } = useNetworkStatus();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [selectedFilters, setSelectedFilters] = useState<string[]>(DEFAULT_FILTERS);
  const userToggledFilters = useRef(false);
  const prevOfflineRef = useRef(isOffline);
  const { error: networkError, dismiss: dismissError, withRetry } = useNetworkError();

  // Date selection state
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [daysWithOrders, setDaysWithOrders] = useState<number[]>([]);

  const selectedDateStr = useMemo(
    () => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    [year, month, day]
  );

  // Fetch days with orders for the calendar dots
  const fetchDaysWithOrders = useCallback(async (fetchYear: number, fetchMonth: number) => {
    try {
      const data = await apiClient.getMonthlySummary(fetchYear, fetchMonth);
      setDaysWithOrders(data.days.map((d: { day: number }) => d.day));
    } catch {
      setDaysWithOrders([]);
    }
  }, []);

  /** Filter chip options — colors and icons match Penpot status palette */
  const filterOptions: FilterChipOption[] = [
    { key: 'aguardando', label: 'Aguardando', color: theme.colors.aguardando, icon: 'schedule' },
    { key: 'preparando', label: 'Preparando', color: theme.colors.preparando, icon: 'local_fire_department' },
    { key: 'pronto', label: 'Pronto', color: theme.colors.pronto, icon: 'notifications' },
    { key: 'entregue', label: 'Entregue', color: theme.colors.textSecondary, icon: 'check_circle' },
  ];

  /** Fetch orders for a given date and filters (explicit params, no stale closures) */
  const fetchOrders = useCallback(async (date: string, filters: string[]) => {
    if (!isAuthenticated) return;
    if (filters.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }
    try {
      const data = await apiClient.getOrders({
        status: filters as OrderStatus[],
        date,
      });

      // Sort delivered orders by deliveredAt descending
      if (filters.includes('entregue') && filters.length === 1) {
        data.sort((a, b) => {
          const aTime = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
          const bTime = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
          return bTime - aTime;
        });
      }

      // Auto-fallback: if no results and entregue not selected, try with entregue (only today)
      const today = new Date();
      const dateIsToday = date === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (data.length === 0 && !filters.includes('entregue') && !userToggledFilters.current && dateIsToday) {
        const allData = await apiClient.getOrders({
          status: [...filters, 'entregue'] as OrderStatus[],
          date,
        });
        if (allData.length > 0 && allData.every(o => o.status === 'entregue')) {
          setOrders(allData);
          setSelectedFilters(prev => [...prev, 'entregue']);
          return;
        }
      }

      setOrders(data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  /** Handler when user selects a day in the calendar */
  const handleDaySelect = useCallback((selectedDay: number, selectedMonth: number, selectedYear: number) => {
    setCalendarModalVisible(false);
    setDay(selectedDay);
    if (selectedYear !== year || selectedMonth !== month) {
      setYear(selectedYear);
      setMonth(selectedMonth);
      fetchDaysWithOrders(selectedYear, selectedMonth);
    }
    const newFilters = ALL_FILTERS as string[];
    setSelectedFilters(newFilters);
    userToggledFilters.current = false;
    const newDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    lastFetchParamsRef.current = { date: newDateStr, filters: newFilters };
    fetchOrders(newDateStr, newFilters);
  }, [year, month, fetchDaysWithOrders, fetchOrders]);

  /** Handler when user changes filter chips */
  const handleFiltersChange = useCallback((filters: string[]) => {
    userToggledFilters.current = true;
    setSelectedFilters(filters);
    lastFetchParamsRef.current = { date: selectedDateStr, filters };
    fetchOrders(selectedDateStr, filters);
  }, [selectedDateStr, fetchOrders]);

  /** Ref to track the last fetched date/filters (avoids realtime overwriting with stale values) */
  const lastFetchParamsRef = useRef({ date: selectedDateStr, filters: selectedFilters });

  /** Refetch using last known params (for realtime/polling/reconnect) */
  const refetchOrders = useCallback(() => {
    const { date, filters } = lastFetchParamsRef.current;
    return fetchOrders(date, filters);
  }, [fetchOrders]);

  // Initial load
  useEffect(() => {
    fetchOrders(selectedDateStr, selectedFilters);
    fetchDaysWithOrders(year, month);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh data when screen regains focus (e.g., after deleting an order)
  useFocusEffect(
    useCallback(() => {
      refetchOrders();
      fetchDaysWithOrders(year, month);
    }, [refetchOrders, year, month, fetchDaysWithOrders])
  );

  // Realtime: subscribe to order events for live updates
  const realtimeChannels = useMemo(() => ['orders:queue', 'orders:payment'], []);

  const { status: realtimeStatus } = useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback((event) => {
      const payload = event.payload;
      if (!payload || !payload.id) {
        refetchOrders();
        return;
      }

      // Handle order deletion
      if (event.event === 'order_deleted') {
        setOrders((prev) => prev.filter((o) => o.id !== payload.id));
        fetchDaysWithOrders(year, month);
        return;
      }

      // For realtime updates, just refetch to avoid stale filter issues
      refetchOrders();
    }, [refetchOrders]),
    onReconnect: useCallback(() => {
      refetchOrders();
    }, [refetchOrders]),
  });

  // Fallback polling — only active when realtime is disconnected and device is online
  useEffect(() => {
    if (!isAuthenticated || realtimeStatus === 'connected' || isOffline) return;

    const interval = setInterval(() => {
      refetchOrders();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetchOrders, isAuthenticated, realtimeStatus, isOffline]);

  // Refetch when transitioning from offline → online
  useEffect(() => {
    if (prevOfflineRef.current && !isOffline) {
      refetchOrders();
    }
    prevOfflineRef.current = isOffline;
  }, [isOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdvanceStatus = async (order: Order) => {
    const nextStatus = NEXT_STATUS[order.status];
    if (!nextStatus) return;

    setAdvancingId(order.id);
    try {
      await withRetry(() => apiClient.updateOrderStatus(order.id, { status: nextStatus }));
      await refetchOrders();
    } catch {
      // Error shown via withRetry toast
    } finally {
      setAdvancingId(null);
    }
  };

  const handleCardPress = (order: Order) => {
    router.push({ pathname: '/(tabs)/payment', params: { orderId: order.id } });
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
              <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', backgroundColor: theme.colors.preparando + '14', borderRadius: 11, paddingHorizontal: 8, height: 22 }}>
                <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 12, color: theme.colors.preparando }}>{ORIGIN_ICON[order.origin] || 'storefront'}</RNText>
                <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 10, color: theme.colors.preparando }}>
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
              {order.items.map(item => {
                const subtotal = item.quantity * item.unitPrice;
                return item.quantity >= 1
                  ? `${item.quantity}x ${item.name} (${formatPrice(subtotal)})`
                  : `${item.quantity}x ${item.name}`;
              }).join('\n')}
            </RNText>

            {/* Line 4: Price */}
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 16, fontWeight: '600', color: theme.colors.text }}>
              {formatPrice(order.totalAmount)}
            </RNText>

            {/* Line 5: Time */}
            <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
              <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 14, color: theme.colors.textSecondary, opacity: 0.7 }}>timer</RNText>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 11, color: theme.colors.textSecondary, opacity: 0.7 }}>{timeLabel}</RNText>
            </View>
          </Pressable>

          {/* Line 6: CTA Button (separate from tappable area) */}
          {showButton ? (
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
          ) : (
            <View
              style={{
                height: 36,
                borderRadius: 18,
                backgroundColor: theme.colors.divider,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                opacity: 0.6,
              }}
              accessibilityLabel="Entregue"
            >
              <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 16, color: theme.colors.textSecondary }}>check_circle</RNText>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 13, color: theme.colors.textSecondary }}>Entregue</RNText>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <Screen>
        <Header title="Pedidos" icon="receipt_long" />
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
        <Header title="Pedidos" icon="receipt_long" />
        <Toast message={networkError.message} visible={networkError.visible} onDismiss={dismissError} />
        <ScrollContainer style={contentGapStyle}>
          <DateChip day={day} month={month} year={year} onPress={() => setCalendarModalVisible(true)} />
          <FilterChips
            options={filterOptions}
            selected={selectedFilters}
            onSelectionChange={handleFiltersChange}
            testID="status-filter"
          />
          <View style={emptyContainerStyle}>
            {/* Illustrated empty state */}
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View style={{
                width: 120,
                height: 150,
                borderRadius: 12,
                backgroundColor: theme.colors.aguardando + '14',
                borderWidth: 1.5,
                borderColor: theme.colors.aguardando + '4D',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <View style={{
                  width: 100,
                  height: 130,
                  borderRadius: 8,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                }}>
                  <View style={{ width: 60, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.textSecondary, opacity: 0.2 }} />
                  <View style={{ width: 50, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.textSecondary, opacity: 0.15 }} />
                  <View style={{ width: 35, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.textSecondary, opacity: 0.1 }} />
                </View>
              </View>
              <View style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: theme.colors.aguardando + '1F',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -30,
              }}>
                <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 24, color: theme.colors.aguardando, opacity: 0.6 }}>receipt_long</RNText>
              </View>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 13, fontWeight: '500', color: theme.colors.textSecondary, opacity: 0.8 }}>
                Nenhum pedido na fila
              </RNText>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 11, fontWeight: '400', color: theme.colors.textSecondary, opacity: 0.5 }}>
                Os novos pedidos aparecerão aqui
              </RNText>
            </View>
          </View>
        </ScrollContainer>

        {/* Calendar Modal */}
        <CalendarModal
          visible={calendarModalVisible}
          onClose={() => setCalendarModalVisible(false)}
          year={year}
          month={month}
          selectedDay={day}
          onDaySelect={handleDaySelect}
          daysWithOrders={daysWithOrders}
          onMonthChange={async (newYear, newMonth) => {
            try {
              const data = await apiClient.getMonthlySummary(newYear, newMonth);
              const days = data.days.map((d: { day: number }) => d.day);
              setDaysWithOrders(days);
              return days;
            } catch {
              setDaysWithOrders([]);
              return [];
            }
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      <Header title="Pedidos" icon="receipt_long" />
      <Toast message={networkError.message} visible={networkError.visible} onDismiss={dismissError} />
      <ScrollContainer style={contentGapStyle}>
        {/* Date Selector */}
        <DateChip day={day} month={month} year={year} onPress={() => setCalendarModalVisible(true)} />

        {/* Status Filter (Penpot: row of tinted chips, gap 8px) */}
        <FilterChips
          options={filterOptions}
          selected={selectedFilters}
          onSelectionChange={handleFiltersChange}
          testID="status-filter"
        />

        {orders.map((order) => renderOrderCard(order))}
      </ScrollContainer>

      {/* Calendar Modal */}
      <CalendarModal
        visible={calendarModalVisible}
        onClose={() => setCalendarModalVisible(false)}
        year={year}
        month={month}
        selectedDay={day}
        onDaySelect={handleDaySelect}
        daysWithOrders={daysWithOrders}
        onMonthChange={async (newYear, newMonth) => {
          try {
            const data = await apiClient.getMonthlySummary(newYear, newMonth);
            const days = data.days.map((d: { day: number }) => d.day);
            setDaysWithOrders(days);
            return days;
          } catch {
            setDaysWithOrders([]);
            return [];
          }
        }}
      />
    </Screen>
  );
}
