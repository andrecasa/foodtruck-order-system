import React from 'react';
import { TouchableOpacity, Text, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

export interface DateChipProps {
  day: number;
  month: number;
  year: number;
  onPress: () => void;
}

/**
 * DateChip — Full-width pill date selector.
 *
 * Penpot specs (source of truth - "Resumo Financeiro"):
 * - Container: bg primary@12%, borderRadius 22, height 44, full width
 * - flexDirection row, alignItems center, justifyContent center, gap 6
 * - Icon: Material Symbols "calendar_today" 18px, color primary
 * - Text: 14px weight 500, color primary, format "DD/MM/YYYY"
 */
export function DateChip({ day, month, year, onPress }: DateChipProps) {
  const theme = useTheme();
  const dateText = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    width: '100%',
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary + '1F', // 12% opacity
  };

  const dateTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.primary,
  };

  const calendarIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    fontWeight: '400',
    color: theme.colors.primary,
  };

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Data selecionada: ${dateText}. Toque para abrir calendário`}
      testID="date-chip"
    >
      <Text style={calendarIconStyle} accessibilityElementsHidden importantForAccessibility="no">
        calendar_today
      </Text>
      <Text style={dateTextStyle}>{dateText}</Text>
    </TouchableOpacity>
  );
}
