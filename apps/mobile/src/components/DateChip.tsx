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
 * DateChip — Touchable pill-shaped date button positioned at the top-right.
 *
 * Displays the currently selected date formatted as "DD/MM/YYYY" with a
 * chevron-down icon. Dark red pill background with white text.
 * Opens the CalendarModal on press.
 *
 * Pixel-perfect specs (from design):
 * - Pill container: bg #7B2D2D, borderRadius 20, paddingHorizontal 14, paddingVertical 8
 * - alignSelf: flex-end (right-aligned)
 * - flexDirection row, alignItems center, gap 6
 * - Date text: 14px, weight 400, color #FFFFFF, format "DD/MM/YYYY"
 * - Calendar icon: white, 16px
 */
export function DateChip({ day, month, year, onPress }: DateChipProps) {
  const theme = useTheme();
  const dateText = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignSelf: 'flex-end',
  };

  const dateTextStyle: TextStyle = {
    fontSize: 13,
    fontWeight: '400',
    color: theme.colors.surface,
  };

  const calendarIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    fontWeight: '400',
    color: theme.colors.surface,
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
      <Text style={dateTextStyle}>{dateText}</Text>
      <Text style={calendarIconStyle} accessibilityElementsHidden importantForAccessibility="no">
        calendar_today
      </Text>
    </TouchableOpacity>
  );
}
