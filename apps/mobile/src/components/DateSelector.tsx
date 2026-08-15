import React from 'react';
import { View, Text as RNText, TouchableOpacity, type ViewStyle, type TextStyle } from 'react-native';
import { getPortugueseMonthName } from '../utils/format';

export interface DateSelectorProps {
  year: number;
  month: number;
  onPrevious: () => void;
  onNext: () => void;
}

/**
 * DateSelector — month navigation with chevron arrows.
 * Rendered inside the CalendarModal.
 *
 * Penpot specs:
 * - Container: flexDirection row, alignItems center, justifyContent center
 * - Chevrons: 24px, color #7B2D2D (Material Icons "chevron_left" / "chevron_right")
 * - Month text: 16px weight 500 color #3D2020, centered between chevrons
 * - Format: "[Mês] [Ano]" (e.g., "Agosto 2026")
 */
export function DateSelector({ year, month, onPrevious, onNext }: DateSelectorProps) {
  const monthName = getPortugueseMonthName(month);
  const label = `${monthName} ${year}`;

  return (
    <View style={containerStyle} testID="date-selector">
      <TouchableOpacity
        onPress={onPrevious}
        accessibilityLabel="Mês anterior"
        accessibilityRole="button"
        testID="date-selector-previous"
      >
        <RNText style={chevronStyle}>chevron_left</RNText>
      </TouchableOpacity>

      <RNText style={monthTextStyle} testID="date-selector-label">
        {label}
      </RNText>

      <TouchableOpacity
        onPress={onNext}
        accessibilityLabel="Próximo mês"
        accessibilityRole="button"
        testID="date-selector-next"
      >
        <RNText style={chevronStyle}>chevron_right</RNText>
      </TouchableOpacity>
    </View>
  );
}

const containerStyle: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
};

const chevronStyle: TextStyle = {
  fontFamily: 'Material Symbols Outlined',
  fontSize: 24,
  color: '#7B2D2D',
};

const monthTextStyle: TextStyle = {
  flex: 1,
  fontSize: 16,
  fontWeight: '500',
  color: '#3D2020',
  textAlign: 'center',
};
