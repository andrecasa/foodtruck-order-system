import React from 'react';
import { View, Text, TouchableOpacity, type TextStyle, type ViewStyle } from 'react-native';
import { formatPrice, formatSelectedDate } from '../utils/format';

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
 * Pixel-perfect specs:
 * - Card: bg rgba(123,45,45,0.06), borderRadius 12, paddingHorizontal 14, paddingVertical 16, gap 8
 * - Date text: 14px weight 500 color #3D2020
 * - Stats row: flexDirection row, justifyContent space-between
 * - Stat value: 20px weight 500, color per type (#7B2D2D for pedidos/faturamento, #2E7D32 for pagos)
 * - Stat label: 11px weight 400, color #8B6B5A
 * - Button: bg #7B2D2D, borderRadius 18, height 36, text 13px weight 400 white, full width
 */
export function SelectedDayCard({
  date,
  orderCount,
  revenue,
  paidOrders,
  totalOrders,
  onViewFullSummary,
}: SelectedDayCardProps) {
  const day = date.getDate();
  const month = date.getMonth() + 1; // getMonth() is 0-based
  const year = date.getFullYear();

  return (
    <View style={cardStyle}>
      {/* Date header */}
      <Text style={dateTextStyle}>
        {formatSelectedDate(day, month, year)}
      </Text>

      {/* Stats row */}
      <View style={statsRowStyle}>
        <View style={statContainerStyle}>
          <Text style={statValuePrimaryStyle}>{orderCount}</Text>
          <Text style={statLabelStyle}>Pedidos</Text>
        </View>
        <View style={statContainerStyle}>
          <Text style={statValuePrimaryStyle}>{formatPrice(revenue)}</Text>
          <Text style={statLabelStyle}>Faturamento</Text>
        </View>
        <View style={statContainerStyle}>
          <Text style={statValueGreenStyle}>{paidOrders}/{totalOrders}</Text>
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
  paddingHorizontal: 14,
  paddingVertical: 16,
  gap: 8,
};

const dateTextStyle: TextStyle = {
  fontSize: 14,
  fontWeight: '500',
  color: '#3D2020',
};

const statsRowStyle: ViewStyle = {
  flexDirection: 'row',
  justifyContent: 'space-between',
};

const statContainerStyle: ViewStyle = {
  alignItems: 'center',
};

const statValuePrimaryStyle: TextStyle = {
  fontSize: 20,
  fontWeight: '500',
  color: '#7B2D2D',
};

const statValueGreenStyle: TextStyle = {
  fontSize: 20,
  fontWeight: '500',
  color: '#2E7D32',
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
  alignItems: 'center',
  justifyContent: 'center',
};

const buttonTextStyle: TextStyle = {
  fontSize: 13,
  fontWeight: '400',
  color: '#FFFFFF',
};
