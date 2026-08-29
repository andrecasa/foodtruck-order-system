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
import { OrderSummary } from '../../components/customer/OrderSummary';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { formatPrice } from '../../utils/format';
import { usePublicBranding } from '../../hooks/customer/usePublicBranding';
import { usePublicOrderTracking } from '../../hooks/customer/usePublicOrderTracking';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';

export interface CustomerTrackingScreenProps {
  /** Tenant slug from the route (`/:slug/pedido/:orderId`). */
  slug: string;
  /** Order id from the route — survives page reload. */
  orderId: string;
}

/** Portuguese status labels shown in the badge. */
const STATUS_LABELS: Record<string, string> = {
  aguardando: 'Aguardando',
  preparando: 'Preparando',
  pronto: 'Pronto',
  entregue: 'Entregue',
};

/** Material Symbols icon per status. */
const STATUS_ICONS: Record<string, string> = {
  aguardando: 'schedule',
  preparando: 'local_fire_department',
  pronto: 'notifications',
  entregue: 'check_circle',
};

/** Portuguese labels for payment status. */
const PAYMENT_LABELS: Record<string, string> = {
  pago: 'Pago',
  pendente: 'Pendente',
};

/**
 * Payment badge icon. Same glyph for both states, matching the operator
 * screens (OrderQueueScreen uses `currency_exchange` for the payment badge).
 */
const PAYMENT_ICON = 'currency_exchange';

/** Fixed width for the solid status/payment badges (px). */
const STATUS_BADGE_WIDTH = 175;

/**
 * Order tracking screen (`/:slug/pedido/:orderId`).
 *
 * Shows the daily order number prominently, the customer name, item summary,
 * total, and the current status via `Badge` (status colors from the theme).
 * Subscribes to realtime status updates (channel from branding) with a 30s
 * polling fallback, all handled by `usePublicOrderTracking`. When the status is
 * `pronto` it highlights the screen (green, check icon), and `entregue` shows a
 * thank-you completion message. Works after reload since the id is in the route.
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

  // Whenever a valid order is being tracked, record it in the session order
  // list (dedup by id). This is the reliable place to persist it — the tracking
  // screen always has the correct order (from the route), so the cardápio's
  // "Meus pedidos" section works regardless of how the customer got here
  // (checkout, reload, or direct link).
  useEffect(() => {
    if (order) {
      addOrder({
        id: order.id,
        dailyNumber: order.dailyNumber,
        customerName: order.customerName,
      });
    }
  }, [order, addOrder]);

  const statusColor = (status: string): string => {
    switch (status) {
      case 'aguardando':
        return theme.colors.aguardando;
      case 'preparando':
        return theme.colors.preparando;
      case 'pronto':
        return theme.colors.pronto;
      case 'entregue':
        return theme.colors.textSecondary;
      default:
        return theme.colors.textSecondary;
    }
  };

  // Payment color mirrors the operator queue: success = pago, error = pendente.
  const paymentColor = (payStatus: string): string =>
    payStatus === 'pago' ? theme.colors.success : theme.colors.error;

  /**
   * Fixed-width (175px) status/payment badge. Tinted background (color + 12%
   * opacity) with the icon and label in the solid color — same visual language
   * as the shared `Badge`, but with a fixed width so Status and Pagamento align.
   */
  const renderStatusBadge = (
    label: string,
    color: string,
    icon: string,
    testID: string,
  ) => (
    <View
      style={{
        width: STATUS_BADGE_WIDTH,
        height: 28,
        borderRadius: theme.borderRadius.full,
        backgroundColor: color + '1F', // 12% opacity tint
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
      }}
      testID={testID}
      accessibilityLabel={label}
    >
      <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 16, color }}>
        {icon}
      </RNText>
      <RNText
        style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: theme.typography.sizes.md,
          fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );

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
          title="Acompanhar Pedido"
          onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
        />
        <View style={centeredStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text color={theme.colors.textSecondary}>Carregando pedido...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
        <CustomerHeader
          title="Acompanhar Pedido"
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
      </SafeAreaView>
    );
  }

  // ─── Loaded ────────────────────────────────────────────────────────────────

  const isReady = order.status === 'pronto';
  const isDelivered = order.status === 'entregue';

  // Status color drives the card frame (border + left stripe), mirroring the
  // operator's order card pattern in OrderQueueScreen.
  const orderColor = statusColor(order.status);

  const contentStyle: ViewStyle = {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    // Leave room for the fixed informative bottom bar (xl spacing token × 3),
    // matching the cardápio's bottom bar clearance.
    paddingBottom: theme.spacing.xl * 3,
  };

  // Informative bottom bar — same look as the cardápio's cart bar, but NOT
  // interactive (no navigation/press). Shows this order's item count and total.
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

  const bottomBarStyle: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  };

  const bottomBarLeftStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  };

  const barIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.surface,
  };

  const barCountBadgeStyle: ViewStyle = {
    minWidth: theme.spacing.lg,
    height: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const barCountTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.xs,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.primary,
  };

  const barLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.surface,
  };

  const barTotalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.surface,
  };

  // Outer frame: row layout so the colored left stripe sits flush against the
  // content. `overflow: 'hidden'` clips the stripe to the rounded corners.
  const numberCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: orderColor + '40',
    flexDirection: 'row',
    overflow: 'hidden',
  };

  // Colored left stripe (status color), same as the operator card.
  const numberCardStripeStyle: ViewStyle = {
    width: 5,
    backgroundColor: orderColor,
  };

  // Inner content area.
  const numberCardBodyStyle: ViewStyle = {
    flex: 1,
    padding: theme.spacing.lg,
    alignItems: 'center',
    gap: theme.spacing.sm,
  };

  const numberLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.textSecondary,
  };

  const numberStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.xxl,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: orderColor,
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

  const statusRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      <CustomerHeader
        title="Acompanhar Pedido"
        onBack={() => router.replace(`/${encodeURIComponent(slug)}`)}
      />
      <ScrollView contentContainerStyle={contentStyle} showsVerticalScrollIndicator>
        <View style={numberCardStyle} testID="tracking-number-card">
          {/* Left stripe — status color */}
          <View style={numberCardStripeStyle} />
          <View style={numberCardBodyStyle}>
            <RNText style={numberLabelStyle}>Seu pedido</RNText>
            <RNText style={numberStyle} accessibilityLabel={`Pedido número ${order.dailyNumber}`}>
              #{order.dailyNumber}
            </RNText>
            <Text size="lg" weight="medium" color={theme.colors.text}>
              {order.customerName}
            </Text>
          </View>
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

        <View style={statusRowStyle}>
          <Text size="md" weight="medium">Status</Text>
          {renderStatusBadge(
            STATUS_LABELS[order.status] ?? order.status,
            statusColor(order.status),
            STATUS_ICONS[order.status] ?? 'schedule',
            'tracking-status-badge',
          )}
        </View>

        <View style={statusRowStyle}>
          <Text size="md" weight="medium">Pagamento</Text>
          {renderStatusBadge(
            PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus,
            paymentColor(order.paymentStatus),
            PAYMENT_ICON,
            'tracking-payment-badge',
          )}
        </View>

        <View style={{ marginTop: theme.spacing.md }}>
          <View style={{ marginBottom: theme.spacing.sm }}>
            <Heading level={3}>Itens</Heading>
          </View>
          <OrderSummary
            testID="tracking-summary"
            lines={order.items.map((item, index) => ({
              key: `${item.itemName}-${index}`,
              name: item.itemName,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
            }))}
            totalCents={order.totalAmountCents}
          />
        </View>
      </ScrollView>

      {/* Informative bottom bar (no action) — mirrors the cardápio's bar. */}
      <View
        style={bottomBarStyle}
        accessibilityLabel={`Pedido com ${itemCount} ${
          itemCount === 1 ? 'item' : 'itens'
        }, total ${formatPrice(order.totalAmountCents)}`}
        testID="tracking-total-bar"
      >
        <View style={bottomBarLeftStyle}>
          <RNText style={barIconStyle}>shopping_cart</RNText>
          <View style={barCountBadgeStyle}>
            <RNText style={barCountTextStyle}>{itemCount}</RNText>
          </View>
          <RNText style={barLabelStyle}>Total do pedido</RNText>
        </View>
        <RNText style={barTotalStyle}>{formatPrice(order.totalAmountCents)}</RNText>
      </View>
    </SafeAreaView>
  );
}
