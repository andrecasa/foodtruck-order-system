import React from 'react';
import { View, Text, TouchableOpacity, type TextStyle, type ViewStyle } from 'react-native';
import { formatPrice } from '../utils/format';

export interface SelectedDayCardProps {
  date: Date;
  orderCount: number;
  revenue: number;         // cents
  paidOrders: number;
  totalOrders: number;
  onViewFullSummary: () => void;
}

/**
 * Selected Day Card — displays the selected day's summary and a CTA button.
 *
 * Pixel-perfect specs (updated):
 * - Card: bg rgba(123,45,45,0.06), borderRadius 12, padding 16, gap 12
 * - Stats row: flexDirection row, gap 8
 * - Sub-card: bg rgba(123,45,45,0.08), borderRadius 8, paddingVertical 10, paddingHorizontal 8, flex 1, alignItems center
 * - Stat value: 20px weight 500 color #7B2D2D
 * - Stat label: 11px weight 400 color #8B6B5A
 * - Button: bg #7B2D2D, borderRadius 18, height 36, full width (alignSelf stretch), text 13px weight 400 white
 */
export function SelectedDayCard({
  date,
  orderCount,
  revenue,
  paidOrders,
  totalOrders,
  onViewFullSummary,
}: SelectedDayCardProps) {
  return (
    <View style={cardStyle}>
      {/* Stats row with sub-cards */}
      <View style={statsRowStyle}>
        <View style={subCardStyle}>
          <Text style={statValueStyle}>{orderCount}</Text>
          <Text style={statLabelStyle}>Pedidos</Text>
        </View>
        <View style={subCardStyle}>
          <Text style={statValueStyle}>{formatPrice(revenue)}</Text>
          <Text style={statLabelStyle}>Faturamento</Text>
        </View>
        <View style={subCardStyle}>
          <Text style={statValueStyle}>{paidOrders}/{totalOrders}</Text>
          <Text style={statLabelStyle}>Pagos</Text>
        </View>
      </View>

      {/* CTA Button */}
      <TouchableOpacity
        style={buttonStyle}
        onPress={onViewFullSummary}
        accessibilityRole="button"
        accessibilityLabel="Ver Resumo Completo"
      >
        <Text style={buttonTextStyle}>Ver Resumo Completo</Text>
      </TouchableOpacity>
    </View>
  );
}

// Static styles

const cardStyle: ViewStyle = {
  backgroundColor: 'rgba(123,45,45,0.06)',
  borderRadius: 12,
  padding: 16,
  gap: 12,
  alignSelf: 'stretch',
};

const statsRowStyle: ViewStyle = {
  flexDirection: 'row',
  gap: 8,
};

const subCardStyle: ViewStyle = {
  flex: 1,
  backgroundColor: 'rgba(123,45,45,0.08)',
  borderRadius: 8,
  paddingVertical: 10,
  paddingHorizontal: 8,
  alignItems: 'center',
  gap: 2,
};

const statValueStyle: TextStyle = {
  fontSize: 20,
  fontWeight: '500',
  color: '#7B2D2D',
};

const statLabelStyle: TextStyle = {
  fontSize: 11,
  fontWeight: '400',
  color: '#8B6B5A',
};

const buttonStyle: ViewStyle = {
  backgroundColor: '#7B2D2D',
  borderRadius: 18,
  height: 36,
  alignSelf: 'stretch',
  paddingHorizontal: 16,
  alignItems: 'center',
  justifyContent: 'center',
};

const buttonTextStyle: TextStyle = {
  fontSize: 13,
  fontWeight: '400',
  color: '#FFFFFF',
};
