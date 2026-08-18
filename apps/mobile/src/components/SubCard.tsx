import React from 'react';
import { View, Text as RNText, type ViewStyle } from 'react-native';

export interface SubCardProps {
  icon: string;
  color: string;
  backgroundColor: string;
  value: string;
  label: string;
  labelColor: string;
}

/**
 * SubCard — reusable stat card with icon circle + value + label.
 * Used in Resumo do Dia, Resumo do Mês, and similar screens.
 */
export function SubCard({ icon, color, backgroundColor, value, label, labelColor }: SubCardProps) {
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
    backgroundColor: color + '1F',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <View style={subCardStyle} accessibilityLabel={`${label}: ${value}`}>
      <View style={iconWrapStyle}>
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 18, color }}>{icon}</RNText>
      </View>
      <View style={{ flex: 1 }}>
        <RNText style={{ fontSize: 15, fontWeight: '600', color }} numberOfLines={1}>{value}</RNText>
        <RNText style={{ fontSize: 10, fontWeight: '400', color: labelColor }}>{label}</RNText>
      </View>
    </View>
  );
}
