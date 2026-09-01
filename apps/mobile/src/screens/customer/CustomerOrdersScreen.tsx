import React, { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Text } from '../../components';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { CustomerOrderCard } from '../../components/customer/CustomerOrderCard';
import { ordersHref } from '../../components/customer/customerNavHref';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';
import { usePublicBranding } from '../../hooks/customer/usePublicBranding';
import { usePublicOrdersTracking } from '../../hooks/customer/usePublicOrdersTracking';

export interface CustomerOrdersScreenProps {
  /** Tenant slug from the route (`/:slug/pedidos`). */
  slug: string;
}

/**
 * "Meus Pedidos" (`/:slug/pedidos`) — the unified customer orders screen.
 *
 * Lists every order the customer placed in THIS session (from
 * `useSessionOrders`), displayed oldest → newest, as a FULL tracking card
 * (`CustomerOrderCard`): payment + status badges, "#N - Name", the item lines,
 * the total, and a "Pedido criado há X" footer. This unifies what used to be a
 * lightweight list + a separate tracking screen into one screen, mirroring the
 * operator OrderQueueScreen (a scrollable list of order cards).
 *
 * Each card's live data comes from `usePublicOrdersTracking` (fetch by id +
 * realtime status/payment updates with a polling fallback). A focus refresh
 * re-reads the persisted session list when returning to the screen.
 */
export function CustomerOrdersScreen({ slug }: CustomerOrdersScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { orders, refresh } = useSessionOrders(slug);
  const { realtimeChannel } = usePublicBranding(slug);

  // Re-read the persisted list whenever the screen regains focus (an order may
  // have been placed on another screen while this one stayed mounted).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { ordersById, isLoading } = usePublicOrdersTracking(slug, orderIds, realtimeChannel);

  // `useSessionOrders` stores orders oldest-first (placement order), so the
  // list is rendered directly in that order.

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const contentStyle: ViewStyle = {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  };

  const centeredStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  };

  const isEmpty = orders.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
        <CustomerHeader
          title="Pedidos"
          onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
        />
        <View style={centeredStyle} testID="orders-empty">
          <Text align="center" color={theme.colors.textSecondary}>
            Você ainda não fez nenhum pedido nesta sessão.
          </Text>
          <Button
            title="Ver cardápio"
            variant="primary"
            onPress={() => router.replace(`/${encodeURIComponent(slug)}`)}
          />
        </View>
        <CustomerBottomNav slug={slug} active="pedidos" pedidosHref={ordersHref(slug)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      <CustomerHeader
        title="Pedidos"
        onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator
      >
        
        {/* Show a spinner only on the very first load, before any card resolves. */}
        {isLoading && Object.keys(ordersById).length === 0 ? (
          <View style={{ paddingVertical: theme.spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.md }} testID="my-orders-section">
          {orders.map((sessionOrder) => {
            const full = ordersById[sessionOrder.id];
            if (!full) return null; // still loading / failed — skip until available
            return (
              <CustomerOrderCard
                key={sessionOrder.id}
                order={full}
                testID={`order-card-${sessionOrder.id}`}
              />
            );
          })}
        </View>
      </ScrollView>

      <CustomerBottomNav slug={slug} active="pedidos" pedidosHref={ordersHref(slug)} />
    </SafeAreaView>
  );
}
