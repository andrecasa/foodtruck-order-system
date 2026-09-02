import React, { useCallback, useState } from 'react';
import {
  View,
  Text as RNText,
  TouchableOpacity,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import type { Order, PaymentMethod } from '@order-system/shared';
import { Screen, ScrollContainer, Modal, Header, Badge, OriginBadge } from '../components';
import { Text } from '../components/Typography';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { formatPrice, formatOrderAge} from '../utils/format';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'PIX' },
  { value: 'cartão débito', label: 'Cartão Débito' },
  { value: 'cartão crédito', label: 'Cartão Crédito' },
  { value: 'dinheiro', label: 'Dinheiro' },
];

export interface PaymentScreenProps {
  /** The order to register payment for */
  order: Order;
  /** Callback invoked after successful payment registration */
  onPaymentSuccess?: (updatedOrder: Order) => void;
}

/**
 * Pagamento (Payment) Screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs (Pastel das Meninas palette):
 * - AppBar: bg white, shadow 0 1px 3px rgba(0,0,0,0.06), title "Pagamento" 18px weight 400, color #3D2020
 * - Content: padding 16px, gap 20px
 * - Order header: "Pedido #1 — Maria Silva" 12px weight 500, color #7B2D2D (primary)
 * - Amount: 32px weight 300, color #3D2020 (text)
 * - Section: 14px weight 500, color #3D2020 (text)
 * - Items card: bg white, radius 12px, shadow, padding 14px
 *   - Item: 14px weight 400 left, quantity "2x" right 14px weight 400 color #8B6B5A
 * - Payment buttons: height 44px, radius 22px
 *   - Unselected: bg white, border 1px #E8DDD5, text 14px weight 400 color #3D2020
 *   - Selected: bg #5A8C5A (success green), no border, text 14px weight 400 color #FFFFFF
 * - Button "Confirmar Pagamento": height 44px, radius 22px, bg #7B2D2D, text 14px weight 400
 */
export function PaymentScreen({ order, onPaymentSuccess }: PaymentScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAlreadyPaid = order.paymentStatus === 'pago';

  const getStatusColor = (): string => {
    switch (order.status) {
      case 'aguardando': return theme.colors.aguardando;
      case 'preparando': return theme.colors.preparando;
      case 'pronto': return theme.colors.pronto;
      case 'entregue': return theme.colors.textSecondary;
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (): string => {
    switch (order.status) {
      case 'aguardando': return 'schedule';
      case 'preparando': return 'local_fire_department';
      case 'pronto': return 'notifications';
      case 'entregue': return 'check_circle';
      default: return 'help';
    }
  };

  const getPayColor = (): string => {
    return order.paymentStatus === 'pago' ? theme.colors.success : theme.colors.error;
  };

  const handleConfirmPress = useCallback(() => {
    if (isAlreadyPaid) {
      setError('Pedido já foi pago');
      return;
    }
    if (!selectedMethod) return;
    setConfirmModalVisible(true);
  }, [selectedMethod, isAlreadyPaid]);

  const handleConfirmPayment = useCallback(async () => {
    if (!selectedMethod) return;

    setConfirmModalVisible(false);
    setLoading(true);
    setError(null);

    try {
      const updatedOrder = await apiClient.registerPayment(order.id, {
        paymentMethod: selectedMethod,
      });
      onPaymentSuccess?.(updatedOrder);
    } catch (err) {
      if (err instanceof Error && err.message.includes('409')) {
        setError('Pedido já foi pago');
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao registrar pagamento');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedMethod, order.id, onPaymentSuccess]);

  const handleCancelModal = useCallback(() => {
    setConfirmModalVisible(false);
  }, []);

  const handleDeleteOrder = useCallback(async () => {
    setDeleteError(null);
    setLoading(true);
    try {
      await apiClient.deleteOrder(order.id);
      setDeleteModalVisible(false);
      router.back();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir pedido');
    } finally {
      setLoading(false);
    }
  }, [order.id, router]);

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    padding: 16,
    gap: 20,
  };

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
  };

  const methodsContainerStyle: ViewStyle = {
    gap: 20,
  };

  const paymentButtonStyle = (selected: boolean): ViewStyle => ({
    height: 44,
    borderRadius: 22,
    backgroundColor: selected ? theme.colors.success : theme.colors.surface,
    borderWidth: selected ? 0 : 1,
    borderColor: selected ? 'transparent' : theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  });

  const paymentButtonTextStyle = (selected: boolean): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: selected ? theme.colors.surface : theme.colors.text,
  });

  const errorContainerStyle: ViewStyle = {
    backgroundColor: theme.colors.error + '14', // 8% opacity
    borderRadius: 12,
    padding: 14,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Screen padding={false}>
      {/* AppBar */}
      <Header title="Pagamento" icon="payments" onBack={() => router.back()} />

      <ScrollContainer padding={false} style={contentStyle}>
        {/* Order Card (same pattern as Fila de Pedidos).
            When the order is not yet paid the card is tappable and navigates
            to the edit-items screen (replaces the old "+ Adicionar" button). */}
        <TouchableOpacity
          disabled={isAlreadyPaid}
          activeOpacity={0.7}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/edit-order-items',
              params: { orderId: order.id },
            })
          }
          accessibilityRole={isAlreadyPaid ? undefined : 'button'}
          accessibilityLabel={isAlreadyPaid ? undefined : 'Editar pedido'}
          testID="order-card"
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: getStatusColor() + '40',
            flexDirection: 'row',
            overflow: 'hidden',
          }}
        >
          {/* Left stripe */}
          <View style={{ width: 5, backgroundColor: getStatusColor(), borderTopLeftRadius: 14, borderBottomLeftRadius: 14 }} />

          {/* Content */}
          <View style={{ flex: 1, padding: 12, gap: 8 }}>
            {/* Line 1: Badges — Pagamento | Origem | Status */}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Badge
                icon="currency_exchange"
                label={order.paymentStatus === 'pago' ? 'Pago' : 'Pendente'}
                color={getPayColor()}
              />
              <OriginBadge origin={order.origin} />
              <Badge
                icon={getStatusIcon()}
                label={order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                color={getStatusColor()}
              />
            </View>

            {/* Line 2: Name */}
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 16, fontWeight: '600', color: theme.colors.text }}>
              #{order.dailyNumber} - {order.customerName}
            </RNText>

            {/* Line 3: Items */}
            <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 12, fontWeight: '400', color: theme.colors.text, lineHeight: 18 }}>
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
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 11, color: theme.colors.textSecondary, opacity: 0.7 }}>{formatOrderAge(order.createdAt)}</RNText>
            </View>
          </View>
        </TouchableOpacity>

        {/* Delete Order button */}
        <TouchableOpacity
          style={{
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.error,
            flexDirection: 'row',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'stretch',
          }}
          onPress={() => { setDeleteError(null); setDeleteModalVisible(true); }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Excluir"
          testID="delete-order-button"
        >
          <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 18, color: theme.colors.error }}>delete</RNText>
          <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 14, fontWeight: '400', color: theme.colors.error }}>Excluir</RNText>
        </TouchableOpacity>

        {/* Error Message */}
        {error ? (
          <View style={errorContainerStyle}>
            <RNText style={errorTextStyle}>{error}</RNText>
          </View>
        ) : null}

        {/* Already Paid State — show only payment method badge + message */}
        {isAlreadyPaid ? (
          <View>
            <RNText style={sectionTitleStyle}>Formas de pagamento</RNText>
            <View style={methodsContainerStyle}>
              <View
                style={{
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: theme.colors.primary + '1F', // 12% opacity
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RNText
                  style={{
                    fontFamily: theme.typography.fontFamily,
                    fontSize: 14,
                    fontWeight: '400',
                    color: theme.colors.primary,
                  }}
                >
                  {PAYMENT_METHODS.find((m) => m.value === order.paymentMethod)?.label ?? 'Pago'}
                </RNText>
              </View>
            </View>
            <RNText
              style={{
                fontFamily: theme.typography.fontFamily,
                fontSize: 12,
                fontWeight: '400',
                color: theme.colors.success,
                textAlign: 'center',
                marginTop: 16,
              }}
            >
              Pedido já foi pago
            </RNText>
          </View>
        ) : (
          <>
            {/* Payment Method Selection */}
            <View>
              <RNText style={sectionTitleStyle}>Formas de pagamento</RNText>
              <View style={methodsContainerStyle}>
                {PAYMENT_METHODS.map((method) => (
                  <TouchableOpacity
                    key={method.value}
                    style={paymentButtonStyle(selectedMethod === method.value)}
                    onPress={() => setSelectedMethod(method.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedMethod === method.value }}
                    accessibilityLabel={method.label}
                    testID={`payment-method-${method.value}`}
                  >
                    <RNText style={paymentButtonTextStyle(selectedMethod === method.value)}>
                      {method.label}
                    </RNText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              style={{
                height: 44,
                borderRadius: 22,
                backgroundColor: !selectedMethod ? theme.colors.surfaceDisabled : theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}
              onPress={handleConfirmPress}
              disabled={!selectedMethod || loading}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Confirmar Pagamento"
              testID="confirm-payment-button"
            >
              <RNText
                style={{
                  fontFamily: theme.typography.fontFamily,
                  fontSize: 14,
                  fontWeight: '400',
                  color: !selectedMethod ? theme.colors.textSecondary : theme.colors.surface,
                }}
              >
                Confirmar Pagamento
              </RNText>
            </TouchableOpacity>

            {/* Skip Payment Button */}
            <TouchableOpacity
              style={{
                height: 44,
                borderRadius: 22,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}
              onPress={() => router.replace('/(tabs)')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Pular Pagamento"
              testID="skip-payment-button"
            >
              <RNText
                style={{
                  fontFamily: theme.typography.fontFamily,
                  fontSize: 14,
                  fontWeight: '400',
                  color: theme.colors.text,
                }}
              >
                Pular Pagamento
              </RNText>
            </TouchableOpacity>

          </>
        )}
      </ScrollContainer>

      {/* Confirmation Modal */}
      <Modal
        visible={confirmModalVisible}
        onClose={handleCancelModal}
        title="Confirmar pagamento"
        confirmLabel="Confirmar"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmPayment}
        onCancel={handleCancelModal}
        testID="payment-confirmation-modal"
      >
        <Text size="md">
          Registrar pagamento de{' '}
          <Text size="md" weight="bold">
            {formatPrice(order.totalAmount)}
          </Text>{' '}
          via{' '}
          <Text size="md" weight="bold">
            {PAYMENT_METHODS.find((m) => m.value === selectedMethod)?.label ?? ''}
          </Text>
          ?
        </Text>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onClose={() => setDeleteModalVisible(false)}
        title="Excluir pedido"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteOrder}
        onCancel={() => setDeleteModalVisible(false)}
        errorMessage={deleteError}
        loading={loading}
        testID="delete-confirmation-modal"
      >
        <Text size="md">
          Tem certeza que deseja excluir o pedido{' '}
          <Text size="md" weight="bold">
            #{order.dailyNumber}
          </Text>
          ? Esta ação não pode ser desfeita.
        </Text>
      </Modal>
    </Screen>
  );
}
