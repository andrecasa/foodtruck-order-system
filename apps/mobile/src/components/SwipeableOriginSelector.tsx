import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  View,
  Text,
  type ViewStyle,
  type TextStyle,
  type LayoutChangeEvent,
} from 'react-native';
import type { OrderOrigin } from '@order-system/shared';

export interface OriginOption {
  key: OrderOrigin;
  label: string;
}

export interface SwipeableOriginSelectorProps {
  value: OrderOrigin;
  onChange: (value: OrderOrigin) => void;
  primaryColor: string;
  surfaceColor: string;
  borderColor: string;
  backgroundColor: string;
  inactiveTextColor: string;
  fontFamily: string;
  /**
   * Segments to render. Defaults to the two operator-authorable origins
   * (Presencial / WhatsApp). Pass a custom list to expose additional
   * segments such as `web` ("QrCode").
   */
  options?: OriginOption[];
  /**
   * When true the entire control is read-only: no drag, no tap, and the
   * thumb stays locked on the current value. Used for `web` (QrCode) orders
   * whose origin cannot be changed.
   */
  disabled?: boolean;
  /**
   * Origins that are visible but NOT selectable. Tapping/dragging onto them
   * is ignored. Used to show "QrCode" as a segment for Presencial/WhatsApp
   * orders without allowing it as a manual destination.
   */
  disabledOptions?: OrderOrigin[];
  testID?: string;
}

const DEFAULT_OPTIONS: OriginOption[] = [
  { key: 'presencial', label: 'Presencial' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const MARGIN = 2;

export function SwipeableOriginSelector({
  value,
  onChange,
  primaryColor,
  surfaceColor,
  borderColor,
  backgroundColor,
  inactiveTextColor,
  fontFamily,
  options = DEFAULT_OPTIONS,
  disabled = false,
  disabledOptions,
  testID,
}: SwipeableOriginSelectorProps) {
  const count = options.length;

  const indexOfValue = useCallback(
    (v: OrderOrigin) => {
      const idx = options.findIndex((o) => o.key === v);
      return idx >= 0 ? idx : 0;
    },
    [options]
  );

  const isSelectable = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return false;
      if (disabled) return false;
      return !(disabledOptions ?? []).includes(option.key);
    },
    [options, disabled, disabledOptions]
  );

  const widthRef = useRef(0);
  const indexRef = useRef(indexOfValue(value));
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const animX = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);
  const [layoutReady, setLayoutReady] = useState(false);

  valueRef.current = value;
  onChangeRef.current = onChange;

  const thumbWidth = useCallback(() => {
    const w = widthRef.current;
    if (w === 0) return 0;
    return (w - MARGIN * 2) / count;
  }, [count]);

  const targetForIndex = useCallback(
    (i: number) => i * thumbWidth(),
    [thumbWidth]
  );

  const snapTo = useCallback(
    (index: number, animated = true) => {
      indexRef.current = index;
      const target = targetForIndex(index);
      if (animated) {
        Animated.spring(animX, {
          toValue: target,
          useNativeDriver: false,
          friction: 8,
          tension: 80,
        }).start();
      } else {
        animX.setValue(target);
      }
    },
    [animX, targetForIndex]
  );

  const commitIndex = useCallback(
    (index: number) => {
      const option = options[index];
      if (!option) return;
      snapTo(index);
      if (option.key !== valueRef.current) {
        onChangeRef.current(option.key);
      }
    },
    [options, snapTo]
  );

  useEffect(() => {
    const idx = indexOfValue(value);
    if (indexRef.current !== idx) {
      snapTo(idx, layoutReady);
    }
  }, [value, layoutReady, snapTo, indexOfValue]);

  useEffect(() => {
    if (widthRef.current > 0) {
      const idx = indexOfValue(valueRef.current);
      indexRef.current = idx;
      animX.setValue(targetForIndex(idx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutReady]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    const idx = indexOfValue(valueRef.current);
    indexRef.current = idx;
    animX.setValue(idx * ((w - MARGIN * 2) / count));
    setLayoutReady(true);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: (_, gs) => !disabled && Math.abs(gs.dx) > 4,
      onMoveShouldSetPanResponderCapture: (_, gs) => !disabled && Math.abs(gs.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStart.current = targetForIndex(indexRef.current);
      },
      onPanResponderMove: (_, gs) => {
        if (disabled) return;
        const tw = thumbWidth();
        const maxX = tw * (count - 1);
        if (maxX <= 0) return;
        const newX = Math.max(0, Math.min(dragStart.current + gs.dx, maxX));
        animX.setValue(newX);
      },
      onPanResponderRelease: (_, gs) => {
        if (disabled) return;
        const tw = thumbWidth();
        if (tw === 0) return;
        const maxX = tw * (count - 1);

        // Tap (negligible movement) → advance to next selectable segment
        if (Math.abs(gs.dx) < 6) {
          let next = indexRef.current;
          for (let step = 1; step <= count; step++) {
            const candidate = (indexRef.current + step) % count;
            if (isSelectable(candidate)) {
              next = candidate;
              break;
            }
          }
          if (next === indexRef.current) {
            // Nothing else selectable → snap back
            snapTo(indexRef.current);
            return;
          }
          commitIndex(next);
          return;
        }

        const finalX = Math.max(0, Math.min(dragStart.current + gs.dx, maxX));
        const nearest = Math.round(finalX / tw);
        // If the nearest segment is not selectable, snap back to current
        if (!isSelectable(nearest)) {
          snapTo(indexRef.current);
          return;
        }
        commitIndex(nearest);
      },
    })
  ).current;

  const handleLabelPress = (index: number) => {
    if (!isSelectable(index)) return;
    commitIndex(index);
  };

  // ── Styles ──

  const containerStyle: ViewStyle = {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: borderColor,
    backgroundColor,
    padding: MARGIN,
    position: 'relative',
    justifyContent: 'center',
    opacity: disabled ? 0.6 : 1,
  };

  const tw = widthRef.current > 0 ? (widthRef.current - MARGIN * 2) / count : undefined;

  const thumbStyle: ViewStyle = {
    position: 'absolute',
    top: MARGIN,
    left: MARGIN,
    width: tw ?? `${100 / count}%`,
    height: 36,
    borderRadius: 18,
    backgroundColor: primaryColor,
    zIndex: 2,
  };

  const labelsOverlayStyle: ViewStyle = {
    position: 'absolute',
    top: MARGIN,
    left: MARGIN,
    right: MARGIN,
    bottom: MARGIN,
    flexDirection: 'row',
    zIndex: 3,
  };

  const labelHalfStyle: ViewStyle = {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const getTextStyle = (index: number): TextStyle => {
    const isActive = value === options[index]!.key;
    const selectable = isSelectable(index);
    return {
      fontFamily,
      fontSize: 13,
      fontWeight: '400',
      color: isActive ? surfaceColor : inactiveTextColor,
      opacity: !isActive && !selectable ? 0.45 : 1,
    };
  };

  return (
    <View
      style={containerStyle}
      onLayout={handleLayout}
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel="Origem do pedido"
    >
      {/* Layer 1: Tap targets for the INACTIVE side (zIndex 1, behind thumb) */}
      <View style={{ position: 'absolute', top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN, flexDirection: 'row', zIndex: 1 }}>
        {options.map((option, index) => (
          <Pressable
            key={option.key}
            style={labelHalfStyle}
            onPress={() => handleLabelPress(index)}
            disabled={!isSelectable(index)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.key, disabled: !isSelectable(index) }}
            accessibilityLabel={option.label}
          />
        ))}
      </View>

      {/* Layer 2: Draggable thumb (zIndex 2, captures drag + tap-to-toggle) */}
      <Animated.View
        style={[thumbStyle, { transform: [{ translateX: animX }] }]}
        {...pan.panHandlers}
      />

      {/* Layer 3: Text labels on top (pointerEvents none, purely visual) */}
      <View style={[labelsOverlayStyle, { pointerEvents: 'none' }]}>
        {options.map((option, index) => (
          <View key={option.key} style={labelHalfStyle}>
            <Text style={getTextStyle(index)}>{option.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
