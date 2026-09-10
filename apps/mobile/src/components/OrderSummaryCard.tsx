import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { formatPrice, formatOrderItemLine } from '../utils/format';

/** Uma linha do resumo: quantidade, nome e preço unitário em centavos. */
export interface OrderSummaryItem {
  /** Nome do item exibido. */
  name: string;
  /** Quantidade selecionada. */
  quantity: number;
  /** Preço unitário em centavos (o subtotal é `quantity * priceCents`). */
  priceCents: number;
}

export interface OrderSummaryCardProps {
  /** Nome do cliente; a linha do nome só aparece quando há texto (após trim). */
  customerName: string;
  /** Itens do pedido, renderizados como um bloco compacto "Nx Nome (subtotal)". */
  items: OrderSummaryItem[];
  /** Total do pedido em centavos, exibido em negrito ao final do card. */
  totalCents: number;
  /** testID do container do card. */
  testID?: string;
  /** testID do bloco interno (nome + itens + total). */
  contentTestID?: string;
  /** testID da linha de total. */
  totalTestID?: string;
}

/**
 * Card "Resumo" — fonte única do resumo de pedido usado tanto pelo checkout do
 * cliente (`CustomerCheckoutScreen`) quanto pela confirmação do operador
 * (`ConfirmOrderScreen`), para que ambos os apps compartilhem um só design.
 *
 * Espelha o card de pagamento do operador (`PaymentScreen`): moldura com uma
 * faixa lateral colorida (primary), linha do nome em negrito (16px/600), bloco
 * de itens compacto (12px/400) via `formatOrderItemLine`, e o total em negrito
 * (16px/600). O total geral vive aqui; não há linha "Total" separada.
 */
export function OrderSummaryCard({
  customerName,
  items,
  totalCents,
  testID,
  contentTestID,
  totalTestID,
}: OrderSummaryCardProps) {
  const theme = useTheme();

  const frameStyle: ViewStyle = {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.divider,
  };

  const stripeStyle: ViewStyle = {
    width: 5,
    backgroundColor: theme.colors.primary,
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

  const trimmedName = customerName.trim();

  return (
    <View style={frameStyle} testID={testID}>
      <View style={stripeStyle} />
      <View
        style={{
          flex: 1,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        }}
        testID={contentTestID}
      >
        {/* Linha do nome — só aparece quando preenchida (16px/600). */}
        {trimmedName.length > 0 ? (
          <RNText style={nameStyle}>{trimmedName}</RNText>
        ) : null}

        {/* Itens — um bloco de texto, "Nx Nome (subtotal)" por linha (12px/400).
            O total não é repetido aqui; fica na linha do total abaixo. */}
        <RNText style={itemsStyle}>
          {items
            .map((i) => formatOrderItemLine(i.quantity, i.name, i.priceCents * i.quantity))
            .join('\n')}
        </RNText>

        {/* Total dentro do card — linha em negrito (16px/600). */}
        <RNText style={totalStyle} testID={totalTestID}>
          {formatPrice(totalCents)}
        </RNText>
      </View>
    </View>
  );
}
