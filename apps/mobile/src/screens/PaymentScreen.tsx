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
import { Screen, ScrollContainer, Modal, Header } from '../components';
import { Text } from '../components/Typography';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';

/** Formats price in centavos to R$ X,XX */
function formatPrice(priceInCentavos: number): string {
  return (priceInCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartão', label: 'Cartão' },
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
 *   - Selected: bg #7B2D2D 12% opacity, no border, text 14px weight 400 color #7B2D2D
 * - Button "Confirmar Pagamento": height 44px, radius 22px, bg #7B2D2D, text 14px weight 400
 */
export function PaymentScreen({ order, onPaymentSuccess }: PaymentScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isAlreadyPaid = order.paymentStatus === 'pago';

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
      setSuccess(true);
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

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    padding: 16,
    gap: 20,
  };

  const orderTotalContainerStyle: ViewStyle = {
    backgroundColor: `${theme.colors.primary}0F`, // 6% opacity
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 4,
    alignSelf: 'stretch',
  };

  const orderHeaderStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: '#8B6B5A',
    textAlign: 'center',
  };

  const amountStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 28,
    fontWeight: '400',
    color: theme.colors.primary,
    textAlign: 'center',
  };

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
  };

  const itemsCardStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.04)',
    elevation: 1,
  };

  const itemRowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  };

  const itemNameStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const itemQuantityStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: '#8B6B5A',
  };

  const methodsContainerStyle: ViewStyle = {
    gap: 20,
  };

  const paymentButtonStyle = (selected: boolean): ViewStyle => ({
    height: 44,
    borderRadius: 22,
    backgroundColor: selected ? `${theme.colors.primary}1F` : '#FFFFFF', // 12% opacity
    borderWidth: selected ? 0 : 1,
    borderColor: selected ? 'transparent' : '#E8DDD5',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const paymentButtonTextStyle = (selected: boolean): TextStyle => ({
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: selected ? theme.colors.primary : theme.colors.text,
  });

  const errorContainerStyle: ViewStyle = {
    backgroundColor: 'rgba(181,64,64,0.08)',
    borderRadius: 12,
    padding: 14,
  };

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.error,
  };

  const successContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  const successTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
    textAlign: 'center',
  };

  const successDetailStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: 12,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Success state
  if (success) {
    return (
      <Screen padding={false}>
        <Header title="Pagamento" icon="payments" />
        <View style={successContainerStyle}>
          <RNText style={successTitleStyle}>Pagamento registrado!</RNText>
          <RNText style={successDetailStyle}>
            {formatPrice(order.totalAmount)} via{' '}
            {PAYMENT_METHODS.find((m) => m.value === selectedMethod)?.label}
          </RNText>
          <View style={{ marginTop: 24, width: '100%', paddingHorizontal: 32 }}>
            <TouchableOpacity
              style={{
                height: 44,
                borderRadius: 22,
                backgroundColor: theme.colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                alignSelf: 'stretch',
              }}
              onPress={() => router.replace('/(tabs)/new-order')}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Novo Pedido"
              testID="new-order-button"
            >
              <RNText
                style={{
                  fontFamily: theme.typography.fontFamily,
                  fontSize: 14,
                  fontWeight: '400',
                  color: '#FFFFFF',
                }}
              >
                Novo Pedido
              </RNText>
            </TouchableOpacity>
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      {/* AppBar */}
      <Header title="Pagamento" icon="payments" />

      <ScrollContainer padding={false} style={contentStyle}>
        {/* Order Header & Amount */}
        <View style={orderTotalContainerStyle}>
          <RNText style={orderHeaderStyle}>
            Pedido #{order.dailyNumber} — {order.customerName}
          </RNText>
          <RNText style={amountStyle}>
            {formatPrice(order.totalAmount)}
          </RNText>
        </View>

        {/* Error Message */}
        {error && (
          <View style={errorContainerStyle}>
            <RNText style={errorTextStyle}>{error}</RNText>
          </View>
        )}

        {/* Order Items */}
        <View>
          <RNText style={sectionTitleStyle}>Itens do pedido</RNText>
          <View style={itemsCardStyle}>
            {order.items.map((item, index) => (
              <View key={`${item.menuItemId}-${index}`} style={itemRowStyle}>
                <RNText style={itemNameStyle}>{item.name}</RNText>
                <RNText style={itemQuantityStyle}>{item.quantity}x</RNText>
              </View>
            ))}
          </View>
        </View>

        {/* Payment Method Selection */}
        <View>
          <RNText style={sectionTitleStyle}>Forma de pagamento</RNText>
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

        {/* Confirm Button — Penpot: full width, height 44, radius 22, bg primary solid */}
        <TouchableOpacity
          style={{
            height: 44,
            borderRadius: 22,
            backgroundColor: (!selectedMethod || isAlreadyPaid) ? '#E8DDD5' : theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'stretch',
          }}
          onPress={handleConfirmPress}
          disabled={!selectedMethod || isAlreadyPaid || loading}
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
              color: (!selectedMethod || isAlreadyPaid) ? '#9E9E9E' : '#FFFFFF',
            }}
          >
            Confirmar Pagamento
          </RNText>
        </TouchableOpacity>

        {/* "+ Adicionar Item" button — Penpot specs:
         * height: 44, borderRadius: 22, bg: #FFFFFF, border: 1px #E8DDD5 inner
         * text: "+" 16px + "Adicionar Item" 14px, weight 400, color #3D2020
         * layout: row, gap 6, alignItems center, justifyContent center
         * horizontalSizing: fill (full width) */}
        <TouchableOpacity
          style={{
            height: 44,
            borderRadius: 22,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E8DDD5',
            flexDirection: 'row',
            gap: 6,
            alignItems: 'center',
            justifyContent: 'center',
            alignSelf: 'stretch',
          }}
          onPress={() => router.replace('/(tabs)/new-order')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Adicionar Item"
          testID="add-items-button-main"
        >
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 16,
              fontWeight: '400',
              color: theme.colors.text,
            }}
          >
            +
          </RNText>
          <RNText
            style={{
              fontFamily: theme.typography.fontFamily,
              fontSize: 14,
              fontWeight: '400',
              color: theme.colors.text,
            }}
          >
            Adicionar Item
          </RNText>
        </TouchableOpacity>

        {isAlreadyPaid && (
          <RNText style={{ ...errorTextStyle, textAlign: 'center', marginTop: 8 }}>
            Pedido já foi pago
          </RNText>
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
    </Screen>
  );
}
