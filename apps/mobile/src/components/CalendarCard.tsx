import React from 'react';
import { View, Text, TouchableOpacity, type ViewStyle, type TextStyle } from 'react-native';
import { generateCalendarGrid } from '../utils/calendar';

export interface CalendarCardProps {
  year: number;
  month: number; // 1-12
  selectedDay: number;
  daysWithOrders: number[]; // day numbers that have orders
  onDayPress: (day: number) => void;
  /** When true, all days are tappable regardless of orders (used when browsing other months) */
  allDaysTappable?: boolean;
}

const WEEKDAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * CalendarCard — interactive monthly calendar grid.
 * Rendered inside the CalendarModal.
 *
 * Pixel-perfect from Penpot:
 * - Card: white bg, borderRadius 12, padding 12, gap 4, shadow 0 1 3 rgba(0,0,0,0.2)
 * - Weekday headers: 11px weight 500 color #8B6B5A, text-align center, height 28
 * - Day cell: flex 1, height 40, column, alignItems center, justifyContent flex-start
 * - Day number: Inter 13px weight 400 color #3D2020
 * - Selected day: 30×30 circle outline stroke 1px #598C59, text #3D2020
 * - Day with orders: 30×30 circle outline stroke 1px #D4812B, text #3D2020
 * - Days without orders: just text, no circle, no dot
 * - Only days with orders are clickable (except when allDaysTappable)
 */
export function CalendarCard({ year, month, selectedDay, daysWithOrders, onDayPress, allDaysTappable = false }: CalendarCardProps) {
  const grid = generateCalendarGrid(year, month);
  const ordersSet = new Set(daysWithOrders);

  return (
    <View style={cardStyle} testID="calendar-card">
      {/* Weekday headers */}
      <View style={weekRowStyle}>
        {WEEKDAY_HEADERS.map((header) => (
          <View key={header} style={headerCellStyle}>
            <Text style={headerTextStyle}>{header}</Text>
          </View>
        ))}
      </View>

      {/* Day grid */}
      {grid.map((row, rowIndex) => (
        <View key={rowIndex} style={weekRowStyle}>
          {row.map((day, colIndex) => (
            <DayCell
              key={`${rowIndex}-${colIndex}`}
              day={day}
              isSelected={day === selectedDay}
              hasOrders={day !== null && ordersSet.has(day)}
              isTappable={allDaysTappable || (day !== null && ordersSet.has(day))}
              onPress={onDayPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

interface DayCellProps {
  day: number | null;
  isSelected: boolean;
  hasOrders: boolean;
  isTappable: boolean;
  onPress: (day: number) => void;
}

function DayCell({ day, isSelected, hasOrders, isTappable, onPress }: DayCellProps) {
  if (day === null) {
    return <View style={dayCellStyle} />;
  }

  // Selected day: green circle outline, dark text
  if (isSelected) {
    return (
      <TouchableOpacity
        style={dayCellStyle}
        onPress={() => onPress(day)}
        accessibilityLabel={`Dia ${day}, selecionado`}
        accessibilityRole="button"
        testID={`calendar-day-${day}`}
      >
        <View style={selectedCircleStyle}>
          <Text style={dayTextStyle}>{day}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Day with orders: amber circle outline, dark text, clickable
  if (hasOrders) {
    return (
      <TouchableOpacity
        style={dayCellStyle}
        onPress={() => onPress(day)}
        accessibilityLabel={`Dia ${day}, com pedidos`}
        accessibilityRole="button"
        testID={`calendar-day-${day}`}
      >
        <View style={ordersCircleStyle}>
          <Text style={dayTextStyle}>{day}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Day without orders but tappable (browsing different months)
  if (isTappable) {
    return (
      <TouchableOpacity
        style={dayCellStyle}
        onPress={() => onPress(day)}
        accessibilityLabel={`Dia ${day}`}
        accessibilityRole="button"
        testID={`calendar-day-${day}`}
      >
        <View style={plainCirclePlaceholder}>
          <Text style={dayTextStyle}>{day}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Day without orders: NOT clickable, just text
  return (
    <View style={dayCellStyle} testID={`calendar-day-${day}`}>
      <View style={plainCirclePlaceholder}>
        <Text style={dayTextStyle}>{day}</Text>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const cardStyle: ViewStyle = {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: 12,
  gap: 4,
  width: '100%',
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.2,
  shadowRadius: 3,
  elevation: 2,
};

const weekRowStyle: ViewStyle = {
  flexDirection: 'row',
};

const headerCellStyle: ViewStyle = {
  flex: 1,
  alignItems: 'center',
  height: 28,
  justifyContent: 'center',
};

const headerTextStyle: TextStyle = {
  fontSize: 11,
  fontWeight: '500',
  color: '#8B6B5A',
  textAlign: 'center',
};

const dayCellStyle: ViewStyle = {
  flex: 1,
  height: 40,
  alignItems: 'center',
  justifyContent: 'flex-start',
  paddingTop: 4,
};

const selectedCircleStyle: ViewStyle = {
  width: 30,
  height: 30,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: '#598C59',
  alignItems: 'center',
  justifyContent: 'center',
};

const ordersCircleStyle: ViewStyle = {
  width: 30,
  height: 30,
  borderRadius: 15,
  borderWidth: 1,
  borderColor: '#D4812B',
  alignItems: 'center',
  justifyContent: 'center',
};

const dayTextStyle: TextStyle = {
  fontSize: 13,
  fontWeight: '400',
  color: '#3D2020',
};

const plainCirclePlaceholder: ViewStyle = {
  width: 30,
  height: 30,
  borderRadius: 15,
  alignItems: 'center',
  justifyContent: 'center',
};
