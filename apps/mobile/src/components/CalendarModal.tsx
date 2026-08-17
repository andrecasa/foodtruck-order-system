import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  TouchableWithoutFeedback,
  View,
  type ViewStyle,
} from 'react-native';
import { DateSelector } from './DateSelector';
import { CalendarLegend } from './CalendarLegend';
import { CalendarCard } from './CalendarCard';
import { useTheme } from '../theme';

export interface CalendarModalProps {
  visible: boolean;
  year: number;
  month: number;
  selectedDay: number;
  daysWithOrders: number[];
  onDaySelect: (day: number, month: number, year: number) => void;
  onMonthChange?: (year: number, month: number) => Promise<number[]> | number[];
  onClose: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SHEET_HEIGHT = 480;
const DISMISS_THRESHOLD = 120;

/**
 * CalendarModal — gesture-driven bottom sheet.
 *
 * Uses PanResponder for drag-to-dismiss (no external dependencies).
 * Slides up from bottom with backdrop, can be dismissed by:
 * - Dragging the handle/sheet downward past threshold
 * - Tapping the backdrop
 *
 * Pixel-perfect from Penpot:
 * - Sheet: bg #FDF8F4, borderRadius 24 top, padding 16h/12t/24b, gap 16
 * - Handle: 40×4px, #7B2D2D at 30% opacity, borderRadius 2
 */
export function CalendarModal({
  visible,
  year,
  month,
  selectedDay,
  daysWithOrders,
  onDaySelect,
  onMonthChange,
  onClose,
}: CalendarModalProps) {
  const theme = useTheme();
  const [modalYear, setModalYear] = useState(year);
  const [modalMonth, setModalMonth] = useState(month);
  const [modalDaysWithOrders, setModalDaysWithOrders] = useState<number[]>(daysWithOrders);
  const [isVisible, setIsVisible] = useState(false);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Reset internal state when opening
  useEffect(() => {
    if (visible) {
      setModalYear(year);
      setModalMonth(month);
      setModalDaysWithOrders(daysWithOrders);
      setIsVisible(true);
      // Animate in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 20,
          stiffness: 200,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      animateOut();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const animateOut = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsVisible(false);
    });
  };

  const handleClose = () => {
    animateOut();
    // Delay onClose to allow animation to finish
    setTimeout(onClose, 220);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 5,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
          handleClose();
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            damping: 20,
            stiffness: 200,
          }).start();
        }
      },
    })
  ).current;

  const fetchDaysForMonth = async (newYear: number, newMonth: number) => {
    if (newYear === year && newMonth === month) {
      setModalDaysWithOrders(daysWithOrders);
    } else if (onMonthChange) {
      const days = await onMonthChange(newYear, newMonth);
      setModalDaysWithOrders(days);
    } else {
      setModalDaysWithOrders([]);
    }
  };

  const handlePrevious = () => {
    const newMonth = modalMonth === 1 ? 12 : modalMonth - 1;
    const newYear = modalMonth === 1 ? modalYear - 1 : modalYear;
    setModalMonth(newMonth);
    setModalYear(newYear);
    fetchDaysForMonth(newYear, newMonth);
  };

  const handleNext = () => {
    const newMonth = modalMonth === 12 ? 1 : modalMonth + 1;
    const newYear = modalMonth === 12 ? modalYear + 1 : modalYear;
    setModalMonth(newMonth);
    setModalYear(newYear);
    fetchDaysForMonth(newYear, newMonth);
  };

  const handleDayPress = (day: number) => {
    animateOut();
    setTimeout(() => {
      onDaySelect(day, modalMonth, modalYear);
    }, 220);
  };

  const isOriginalMonth = modalYear === year && modalMonth === month;

  if (!isVisible) return null;

  return (
    <View style={overlayStyle} testID="calendar-modal">
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleClose} testID="calendar-modal-backdrop">
        <Animated.View style={[backdropStyle, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Bottom Sheet */}
      <Animated.View
        style={[sheetStyle, { backgroundColor: theme.colors.background, transform: [{ translateY }] }]}
        testID="calendar-modal-content"
      >
        {/* Drag Handle */}
        <View {...panResponder.panHandlers} style={handleAreaStyle}>
          <View style={handleStyle} />
        </View>

        {/* Month Selector */}
        <DateSelector
          year={modalYear}
          month={modalMonth}
          onPrevious={handlePrevious}
          onNext={handleNext}
        />

        {/* Calendar Grid */}
        <CalendarCard
          year={modalYear}
          month={modalMonth}
          selectedDay={isOriginalMonth ? selectedDay : -1}
          daysWithOrders={modalDaysWithOrders}
          onDayPress={handleDayPress}
          allDaysTappable={false}
        />

        {/* Legend */}
        <View style={legendWrapperStyle}>
          <CalendarLegend />
        </View>
      </Animated.View>
    </View>
  );
}

const overlayStyle: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1000,
};

const backdropStyle: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.4)',
};

const sheetStyle: ViewStyle = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: undefined, // set dynamically via inline style
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  paddingHorizontal: 16,
  paddingBottom: 16,
  gap: 12,
  alignItems: 'center',
};

const handleAreaStyle: ViewStyle = {
  width: '100%',
  alignItems: 'center',
  paddingTop: 12,
  paddingBottom: 4,
};

const handleStyle: ViewStyle = {
  width: 40,
  height: 4,
  borderRadius: 2,
  backgroundColor: 'rgba(123, 45, 45, 0.3)',
};

const legendWrapperStyle: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: 20,
};
