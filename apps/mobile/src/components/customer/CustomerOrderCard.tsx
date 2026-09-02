import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import type { PublicOrderResponse } from '@order-system/shared';
import { useTheme } from '../../theme';
import { Badge } from '../Badge';
import { OriginBadge } from '../OriginBadge';
import { formatPrice, formatOrderAge, formatOrderItemLine } from '../../utils/format';

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

/** Payment badge icon (same glyph both states, matching the operator screens). */
const PAYMENT_ICON = 'currency_exchange';



export interface CustomerOrderCardProps {
  order: PublicOrderResponse;
  testID?: string;
}

/**
 * A single public order card — the building block for the customer "Meus
 * Pedidos" list. Mirrors the operator OrderQueueScreen / PaymentScreen card: a
 * status-colored left stripe, a row of badges (payment + origin + status), the
 * "#N - Name" line, the item lines (`Nx name (subtotal)`), the total, and a
 * "Pedido criado há X" footer. When the order is `pronto` it also shows a green
 * "Seu pedido está pronto." banner, and when `entregue` a neutral "Pedido
 * entregue. Obrigado!" banner (both with a check icon).
 *
 * Colors come from the theme; status maps match the operator screens so both
 * apps speak one visual language.
 */
export function CustomerOrderCard({ order, testID }: CustomerOrderCardProps) {
  const theme = useTheme();

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

  const paymentColor = (payStatus: string): string =>
    payStatus === 'pago' ? theme.colors.success : theme.colors.error;

  const orderColor = statusColor(order.status);

  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: orderColor + '40',
    flexDirection: 'row',
    overflow: 'hidden',
  };

  const cardStripeStyle: ViewStyle = {
    width: 5,
    backgroundColor: orderColor,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  };

  const cardBodyStyle: ViewStyle = {
    flex: 1,
    padding: 12,
    gap: 8,
  };

  const badgeRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  };

  const nameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  };

  const itemsStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
    lineHeight: 18,
  };

  const totalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  };

  const timeRowStyle: ViewStyle = {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  };

  const timeIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 14,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  };

  const timeTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  };

  const isReady = order.status === 'pronto';
  const isDelivered = order.status === 'entregue';

  // "Pronto" banner — green tinted surface + check icon + message, matching the
  // former tracking screen. "Entregue" banner — neutral surface + check icon.
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
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.pronto,
  };

  const readyTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: '600',
    color: theme.colors.pronto,
  };

  const deliveredBannerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.divider,
    padding: theme.spacing.md,
  };

  const deliveredIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.textSecondary,
  };

  const deliveredTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  };

  return (
    <View style={cardStyle} testID={testID}>
      <View style={cardStripeStyle} />
      <View style={cardBodyStyle}>
        {/* Line 1: payment + status badges */}
        <View style={badgeRowStyle}>
          <View testID={testID ? `${testID}-payment-badge` : undefined}>
            <Badge
              icon={PAYMENT_ICON}
              label={PAYMENT_LABELS[order.paymentStatus] ?? order.paymentStatus}
              color={paymentColor(order.paymentStatus)}
            />
          </View>
          <OriginBadge
            origin={order.origin}
            testID={testID ? `${testID}-origin-badge` : undefined}
          />
          <View testID={testID ? `${testID}-status-badge` : undefined}>
            <Badge
              icon={STATUS_ICONS[order.status] ?? 'schedule'}
              label={STATUS_LABELS[order.status] ?? order.status}
              color={orderColor}
            />
          </View>
        </View>

        {/* Line 2: "#N - Name" */}
        <RNText style={nameStyle}>
          #{order.dailyNumber} - {order.customerName}
        </RNText>

        {/* Line 3: items — "Nx name (subtotal)" per line */}
        <RNText style={itemsStyle}>
          {order.items
            .map((item) =>
              formatOrderItemLine(item.quantity, item.itemName, item.quantity * item.unitPriceCents),
            )
            .join('\n')}
        </RNText>

        {/* Line 4: total */}
        <RNText style={totalStyle}>{formatPrice(order.totalAmountCents)}</RNText>

        {/* Line 5: "Pedido criado há X" */}
        <View style={timeRowStyle}>
          <RNText style={timeIconStyle}>timer</RNText>
          <RNText style={timeTextStyle}>{formatOrderAge(order.createdAt)}</RNText>
        </View>

        {/* Ready banner — shown when the order is "pronto". */}
        {isReady ? (
          <View style={readyBannerStyle} testID={testID ? `${testID}-ready-banner` : undefined}>
            <RNText style={readyIconStyle}>check_circle</RNText>
            <RNText style={readyTextStyle}>Seu pedido está pronto.</RNText>
          </View>
        ) : null}

        {/* Delivered banner — shown when the order is "entregue". */}
        {isDelivered ? (
          <View
            style={deliveredBannerStyle}
            testID={testID ? `${testID}-delivered-banner` : undefined}
          >
            <RNText style={deliveredIconStyle}>check_circle</RNText>
            <RNText style={deliveredTextStyle}>Pedido entregue. Obrigado!</RNText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
