import React from 'react';
import { View, Text, type TextStyle, type ViewStyle } from 'react-native';
import { formatPrice } from '../utils/format';

export interface MonthlySummaryCardProps {
  monthName: string;       // Portuguese month name
  totalOrders: number;
  totalRevenue: number;    // cents
  totalReceived: number;   // cents
  totalPending: number;    // cents
}

interface SubCardConfig {
  label: string;
  icon: string;
  color: string;
  backgroundColor: string;
  value: string;
}

/**
 * Monthly Summary Card — "Acumulado em [Mês]"
 *
 * Displays four sub-cards in a 2×2 grid:
 * - Pedidos (receipt_long, #7B2D2D)
 * - Faturamento (payments, #D4812B)
 * - Recebido (check_circle, #2E7D32)
 * - Pendente (schedule, #C62828)
 *
 * Pixel-perfect specs:
 * - Card: white bg, borderRadius 12, padding 14, column gap 12
 * - Title: "Acumulado em [Mês]" with calendar_month icon (20px, color #7B2D2D)
 * - Sub-cards container: 2 rows, each row flexDirection row, gap 10
 * - Each sub-card: borderRadius 10, padding 10h/12v, height 60, flex 1
 * - Icon wrap: 34×34, borderRadius 17, bg = statusColor@12%
 * - Value: 15px weight 600, color = statusColor
 * - Label: 10px weight 400, color #8B6B5A
 */
export function MonthlySummaryCard({
  monthName,
  totalOrders,
  totalRevenue,
  totalReceived,
  totalPending,
}: MonthlySummaryCardProps) {
  const subCards: SubCardConfig[] = [
    {
      label: 'Pedidos',
      icon: 'receipt_long',
      color: '#7B2D2D',
      backgroundColor: '#FDF8F4',
      value: String(totalOrders),
    },
    {
      label: 'Faturamento',
      icon: 'payments',
      color: '#D4812B',
      backgroundColor: '#FFF8F0',
      value: formatPrice(totalRevenue),
    },
    {
      label: 'Recebido',
      icon: 'check_circle',
      color: '#2E7D32',
      backgroundColor: '#F0F8F0',
      value: formatPrice(totalReceived),
    },
    {
      label: 'Pendente',
      icon: 'schedule',
      color: '#C62828',
      backgroundColor: '#FEF2F2',
      value: formatPrice(totalPending),
    },
  ];

  return (
    <View style={cardStyle}>
      {/* Title row */}
      <View style={titleRowStyle}>
        <Text style={titleIconStyle}>calendar_month</Text>
        <Text style={titleTextStyle}>Acumulado em {monthName}</Text>
      </View>

      {/* Sub-cards grid: 2 rows of 2 */}
      <View style={gridContainerStyle}>
        <View style={rowStyle}>
          {subCards[0] && <SubCard config={subCards[0]} />}
          {subCards[1] && <SubCard config={subCards[1]} />}
        </View>
        <View style={rowStyle}>
          {subCards[2] && <SubCard config={subCards[2]} />}
          {subCards[3] && <SubCard config={subCards[3]} />}
        </View>
      </View>
    </View>
  );
}

function SubCard({ config }: { config: SubCardConfig }) {
  const { label, icon, color, backgroundColor, value } = config;

  const subCardStyle: ViewStyle = {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    height: 60,
    backgroundColor,
    gap: 8,
  };

  const iconWrapStyle: ViewStyle = {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color + '1F', // ~12% opacity
    alignItems: 'center',
    justifyContent: 'center',
  };

  const iconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color,
  };

  const valueStyle: TextStyle = {
    fontSize: 15,
    fontWeight: '600',
    color,
  };

  const labelStyle: TextStyle = {
    fontSize: 10,
    fontWeight: '400',
    color: '#8B6B5A',
  };

  return (
    <View style={subCardStyle} accessibilityLabel={`${label}: ${value}`}>
      <View style={iconWrapStyle}>
        <Text style={iconStyle} accessibilityElementsHidden importantForAccessibility="no">
          {icon}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={valueStyle} numberOfLines={1}>{value}</Text>
        <Text style={labelStyle}>{label}</Text>
      </View>
    </View>
  );
}

// Static styles

const cardStyle: ViewStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: 14,
  gap: 12,
};

const titleRowStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
};

const titleIconStyle: TextStyle = {
  fontFamily: 'Material Symbols Outlined',
  fontSize: 20,
  color: '#7B2D2D',
};

const titleTextStyle: TextStyle = {
  fontSize: 14,
  fontWeight: '500',
  color: '#3D2020',
};

const gridContainerStyle: ViewStyle = {
  gap: 10,
};

const rowStyle: ViewStyle = {
  flexDirection: 'row',
  gap: 10,
};
