import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { Button, Heading, Text } from '../../components';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { CustomerOrderCard } from '../../components/customer/CustomerOrderCard';
import { ordersHref } from '../../components/customer/customerNavHref';
import { usePublicBranding } from '../../hooks/customer/usePublicBranding';
import { usePublicOrderTracking } from '../../hooks/customer/usePublicOrderTracking';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';

export interface CustomerTrackingScreenProps {
  /** Tenant slug from the route (`/:slug/pedido/:orderId`). */
  slug: string;
  /** Order id from the route — survives page reload. */
  orderId: string;
}

/**
 * Order tracking screen (`/:slug/pedido/:orderId`) — "Pedidos".
 *
 * Renders the shared `CustomerOrderCard` (badges, "#N - name", item lines,
 * total, and a "Pedido criado há X" footer) — the same card used by the "Meus
 * Pedidos" list — plus ready/delivered banners for this single order.
 * Subscribes to realtime status updates with a polling fallback via
 * `usePublicOrderTracking`; when `pronto` it shows a ready banner and `entregue`
 * a thank-you message. A customer bottom nav (Novo / Pedidos) is pinned at the
 * bottom. Works after reload since the id is in the route.
 */
export function CustomerTrackingScreen({ slug, orderId }: CustomerTrackingScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { realtimeChannel } = usePublicBranding(slug);
  const { order, isLoading, error, refetch } = usePublicOrderTracking(
    slug,
    orderId,
    realtimeChannel,
  );
  const { addOrder } = useSessionOrders(slug);

  // Record the tracked order into the session list (dedup by id) so the
  // cardápio's "Meus pedidos" works regardless of how the customer got here.
  useEffect(() => {
    if (order) {
      addOrder({
        id: order.id,
        dailyNumber: order.dailyNumber,
        customerName: order.customerName,
        status: order.status,
      });
    }
  }, [order, addOrder]);

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const centeredStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  };

  // ─── Loading / error ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
        <CustomerHeader
          title="Pedidos"
          onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
        />
        <View style={centeredStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text color={theme.colors.textSecondary}>Carregando pedido...</Text>
        </View>
        <CustomerBottomNav
          slug={slug}
          active="pedidos"
          pedidosHref={ordersHref(slug)}
        />
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
        <CustomerHeader
          title="Pedidos"
          onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
        />
        <View style={centeredStyle} testID="tracking-error">
          <Text align="center" color={theme.colors.error}>
            {error?.message ?? 'Pedido não encontrado.'}
          </Text>
          {error?.notFound ? (
            <Button
              title="Voltar ao cardápio"
              variant="primary"
              onPress={() => router.replace(`/${encodeURIComponent(slug)}`)}
            />
          ) : (
            <Button title="Tentar novamente" variant="primary" onPress={refetch} />
          )}
        </View>
        <CustomerBottomNav
          slug={slug}
          active="pedidos"
          pedidosHref={ordersHref(slug)}
        />
      </SafeAreaView>
    );
  }

  // ─── Loaded ────────────────────────────────────────────────────────────────

  const isReady = order.status === 'pronto';
  const isDelivered = order.status === 'entregue';

  const contentStyle: ViewStyle = {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  };

  const readyBannerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceReceived,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  };

  const readyIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xxl,
    color: theme.colors.pronto,
  };

  const readyTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.pronto,
  };

  const deliveredBannerStyle: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    padding: theme.spacing.md,
  };

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
        {/* Full order card (badges, #N-name, items, total, "criado há X"),
            shared with the "Meus Pedidos" list via CustomerOrderCard. */}
        <View testID="tracking-number-card">
          <CustomerOrderCard order={order} testID="tracking-order" />
        </View>

        {isReady ? (
          <View style={readyBannerStyle} testID="tracking-ready-banner">
            <RNText style={readyIconStyle}>check_circle</RNText>
            <RNText style={readyTextStyle}>Seu pedido está pronto!</RNText>
          </View>
        ) : null}

        {isDelivered ? (
          <View style={deliveredBannerStyle} testID="tracking-delivered-banner">
            <Heading level={3} align="center">
              Pedido entregue. Obrigado!
            </Heading>
          </View>
        ) : null}
      </ScrollView>

      <CustomerBottomNav
        slug={slug}
        active="pedidos"
        pedidosHref={ordersHref(slug)}
      />
    </SafeAreaView>
  );
}
