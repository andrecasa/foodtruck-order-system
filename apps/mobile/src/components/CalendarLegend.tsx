import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * CalendarLegend — static legend row for the calendar modal.
 *
 * Displays two circle+label pairs:
 * - Amber circle outline (#D4812B): "Dia com pedidos"
 * - Green circle outline (#598C59): "Dia selecionado"
 *
 * Pixel-perfect specs:
 * - Container: flexDirection row, gap 16, alignItems center
 * - Each item: flexDirection row, gap 6, alignItems center
 * - Circles: 12px, borderRadius 6, stroke 1px (outline only, no fill)
 * - Text: 11px weight 400, color rgba(61, 32, 32, 0.7)
 */
export function CalendarLegend() {
  const theme = useTheme();

  const textColor = theme.colors.text + 'B3'; // 70% opacity

  return (
    <View style={containerStyle} testID="calendar-legend">
      <View style={itemStyle}>
        <View style={[circleStyle, { borderColor: theme.colors.secondary }]} />
        <Text style={[labelStyle, { color: textColor }]}>Dia com pedidos</Text>
      </View>
      <View style={itemStyle}>
        <View style={[circleStyle, { borderColor: theme.colors.success }]} />
        <Text style={[labelStyle, { color: textColor }]}>Dia selecionado</Text>
      </View>
    </View>
  );
}

const containerStyle: ViewStyle = {
  flexDirection: 'row',
  gap: 16,
  alignItems: 'center',
};

const itemStyle: ViewStyle = {
  flexDirection: 'row',
  gap: 6,
  alignItems: 'center',
};

const circleStyle: ViewStyle = {
  width: 12,
  height: 12,
  borderRadius: 6,
  borderWidth: 1,
};

const labelStyle: TextStyle = {
  fontSize: 11,
  fontWeight: '400',
};
