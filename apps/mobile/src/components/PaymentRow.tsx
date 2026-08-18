import React from 'react';
import { View, Text as RNText } from 'react-native';

export interface PaymentRowProps {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  textColor: string;
}

/**
 * PaymentRow — reusable row with icon circle + label + value.
 * Used in Resumo do Dia, Resumo do Mês for payment method breakdown.
 */
export function PaymentRow({ icon, iconColor, label, value, textColor }: PaymentRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, gap: 12 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: iconColor + '1F', alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 16, color: iconColor }}>{icon}</RNText>
      </View>
      <RNText style={{ flex: 1, fontSize: 14, fontWeight: '400', color: textColor }}>{label}</RNText>
      <RNText style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{value}</RNText>
    </View>
  );
}
