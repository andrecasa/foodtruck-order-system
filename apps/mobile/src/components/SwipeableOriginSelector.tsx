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

export interface SwipeableOriginSelectorProps {
  value: OrderOrigin;
  onChange: (value: OrderOrigin) => void;
  primaryColor: string;
  surfaceColor: string;
  dividerColor: string;
  backgroundColor: string;
  inactiveTextColor: string;
  fontFamily: string;
  testID?: string;
}

const OPTIONS: { key: OrderOrigin; label: string }[] = [
  { key: 'presencial', label: 'Presencial' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const MARGIN = 2;

export function SwipeableOriginSelector({
  value,
  onChange,
  primaryColor,
  surfaceColor,
  dividerColor,
  backgroundColor,
  inactiveTextColor,
  fontFamily,
  testID,
}: SwipeableOriginSelectorProps) {
  const widthRef = useRef(0);
  const indexRef = useRef(value === 'presencial' ? 0 : 1);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const animX = useRef(new Animated.Value(0)).current;
  const dragStart = useRef(0);
  const [layoutReady, setLayoutReady] = useState(false);

  valueRef.current = value;
  onChangeRef.current = onChange;

  const maxX = () => {
    const w = widthRef.current;
    if (w === 0) return 0;
    const thumbW = (w - MARGIN * 2) / 2;
    return w - thumbW - MARGIN * 2;
  };

  const targetForIndex = (i: number) => (i === 0 ? 0 : maxX());

  const snapTo = useCallback((index: number, animated = true) => {
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
  }, [animX]);

  useEffect(() => {
    const idx = value === 'presencial' ? 0 : 1;
    if (indexRef.current !== idx) {
      snapTo(idx, layoutReady);
    }
  }, [value, layoutReady, snapTo]);

  useEffect(() => {
    if (widthRef.current > 0) {
      const idx = valueRef.current === 'presencial' ? 0 : 1;
      indexRef.current = idx;
      animX.setValue(targetForIndex(idx));
    }
  }, [layoutReady]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    const idx = valueRef.current === 'presencial' ? 0 : 1;
    indexRef.current = idx;
    const thumbW = (w - MARGIN * 2) / 2;
    const target = idx === 0 ? 0 : w - thumbW - MARGIN * 2;
    animX.setValue(target);
    setLayoutReady(true);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 4,
      onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dx) > 4,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStart.current = targetForIndex(indexRef.current);
      },
      onPanResponderMove: (_, gs) => {
        const mx = maxX();
        if (mx === 0) return;
        const newX = Math.max(0, Math.min(dragStart.current + gs.dx, mx));
        animX.setValue(newX);
      },
      onPanResponderRelease: (_, gs) => {
        const mx = maxX();
        if (mx === 0) return;

        if (Math.abs(gs.dx) < 6) {
          // Tap on thumb → toggle
          const newIdx = indexRef.current === 0 ? 1 : 0;
          snapTo(newIdx);
          const newVal: OrderOrigin = newIdx === 0 ? 'presencial' : 'whatsapp';
          if (newVal !== valueRef.current) {
            onChangeRef.current(newVal);
          }
          return;
        }

        const finalX = Math.max(0, Math.min(dragStart.current + gs.dx, mx));
        const newIdx = finalX > mx / 2 ? 1 : 0;
        snapTo(newIdx);
        const newVal: OrderOrigin = newIdx === 0 ? 'presencial' : 'whatsapp';
        if (newVal !== valueRef.current) {
          onChangeRef.current(newVal);
        }
      },
    })
  ).current;

  const handleLabelPress = (index: number) => {
    snapTo(index);
    const newVal: OrderOrigin = index === 0 ? 'presencial' : 'whatsapp';
    if (newVal !== value) {
      onChange(newVal);
    }
  };

  // ── Styles ──

  const containerStyle: ViewStyle = {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: dividerColor,
    backgroundColor,
    padding: MARGIN,
    position: 'relative',
    justifyContent: 'center',
  };

  const thumbW = widthRef.current > 0
    ? (widthRef.current - MARGIN * 2) / 2
    : undefined;

  const thumbStyle: ViewStyle = {
    position: 'absolute',
    top: MARGIN,
    left: MARGIN,
    width: thumbW ?? '50%',
    height: 36,
    borderRadius: 18,
    backgroundColor: primaryColor,
    zIndex: 2,
  };

  // Labels are absolutely positioned on top of everything, but pass touches through
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

  const getTextStyle = (index: number): TextStyle => ({
    fontFamily,
    fontSize: 13,
    fontWeight: '400',
    color: value === OPTIONS[index]!.key ? surfaceColor : inactiveTextColor,
  });

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
        {OPTIONS.map((option, index) => (
          <Pressable
            key={option.key}
            style={labelHalfStyle}
            onPress={() => handleLabelPress(index)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === option.key }}
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
      <View style={labelsOverlayStyle} pointerEvents="none">
        {OPTIONS.map((option, index) => (
          <View key={option.key} style={labelHalfStyle}>
            <Text style={getTextStyle(index)}>{option.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
