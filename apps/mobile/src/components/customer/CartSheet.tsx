import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  ScrollView,
  TouchableWithoutFeedback,
  View,
  Text as RNText,
  Pressable,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { formatPrice } from '../../utils/format';
import { CartLineItem } from './CartLineItem';
import type { CartItem } from '../../hooks/customer/useCart';

export interface CartSheetProps {
  visible: boolean;
  onClose: () => void;
  items: CartItem[];
  /** Total price in centavos. */
  total: number;
  onIncrement: (menuItemId: string) => void;
  onDecrement: (menuItemId: string) => void;
  onRemove: (menuItemId: string) => void;
  /** Called when "Fazer Pedido" is pressed (navigate to checkout). */
  onCheckout: () => void;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const DISMISS_THRESHOLD = 120;
const BACKDROP_FADE_MS = 200;

/**
 * Bottom-sheet review of the cart.
 *
 * Uses the SAME gesture-driven bottom-sheet pattern as `CalendarModal` (the
 * operator's calendar): an absolute overlay with an animated, translucent
 * backdrop, a slide-up `Animated.spring` sheet, and `PanResponder`
 * drag-to-dismiss (no native RN `Modal`, no external deps). Dismiss by dragging
 * the handle/sheet down past the threshold or tapping the backdrop.
 *
 * Lists each cart line (`CartLineItem`) with quantity steppers and a remove
 * action, shows the grand total in the footer, and offers a "Fazer Pedido"
 * button that navigates to checkout. The button is disabled while the cart is
 * empty (Requirement 6.9).
 */
export function CartSheet({
  visible,
  onClose,
  items,
  total,
  onIncrement,
  onDecrement,
  onRemove,
  onCheckout,
}: CartSheetProps) {
  const theme = useTheme();
  const isEmpty = items.length === 0;

  const [isMounted, setIsMounted] = useState(false);

  // The sheet is NOT animated in from the bottom on open: it appears already at
  // rest (translateY = 0). Only the backdrop fades in. The drag-to-dismiss
  // gesture and the slide-out on close still use translateY.
  const translateY = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Mounted hidden; skip animating on first run so a JS-driven animation isn't
  // scheduled needlessly (mirrors CalendarModal).
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      if (!visible) return;
    }

    if (visible) {
      setIsMounted(true);
      // No slide-up: put the sheet at rest immediately and only fade the backdrop.
      translateY.setValue(0);
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: BACKDROP_FADE_MS,
        useNativeDriver: false,
      }).start();
    } else {
      animateOut();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop any in-flight JS-driven animation on unmount so it doesn't keep
  // scheduling frame timers after teardown.
  useEffect(() => {
    return () => {
      translateY.stopAnimation();
      backdropOpacity.stopAnimation();
    };
  }, [translateY, backdropOpacity]);

  const animateOut = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SCREEN_HEIGHT,
        duration: BACKDROP_FADE_MS,
        useNativeDriver: false,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: BACKDROP_FADE_MS,
        useNativeDriver: false,
      }),
    ]).start(() => {
      setIsMounted(false);
    });
  };

  const handleClose = () => {
    animateOut();
    // Delay onClose to allow the slide-out animation to finish.
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
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: false,
            damping: 20,
            stiffness: 200,
          }).start();
        }
      },
    }),
  ).current;

  const handleCheckout = () => {
    // Close with the same animation, then hand off to the caller.
    animateOut();
    setTimeout(onCheckout, 220);
  };

  // ─── Styles (theme tokens only for content; sheet shell mirrors CalendarModal) ──

  const sheetStyle: ViewStyle = {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
    maxHeight: '80%',
  };

  const headerRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    alignItems: 'center',
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const closeIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.textSecondary,
  };

  const emptyTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.regular) as TextStyle['fontWeight'],
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  };

  const footerStyle: ViewStyle = {
    marginTop: theme.spacing.md,
    gap: theme.spacing.lg,
  };

  const totalRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const totalLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.text,
  };

  const totalValueStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.primary,
  };

  if (!isMounted && !visible) return null;

  return (
    <View style={overlayStyle} testID="cart-sheet">
      {/* Backdrop — translucent scrim, same as CalendarModal */}
      <TouchableWithoutFeedback onPress={handleClose} testID="cart-sheet-backdrop">
        <Animated.View style={[backdropStyle, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Bottom Sheet */}
      <Animated.View
        style={[sheetStyle, { transform: [{ translateY }] }]}
        testID="cart-sheet-content"
      >
        {/* Drag Handle */}
        <View {...panResponder.panHandlers} style={handleAreaStyle}>
          <View style={handleStyle(theme.colors.primary)} />
        </View>

        <View style={headerRowStyle}>
          <RNText style={titleStyle} accessibilityRole="header">
            Seu carrinho
          </RNText>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar carrinho"
            hitSlop={8}
          >
            <RNText style={closeIconStyle}>close</RNText>
          </Pressable>
        </View>

        {isEmpty ? (
          <RNText style={emptyTextStyle}>Seu carrinho está vazio.</RNText>
        ) : (
          <ScrollView showsVerticalScrollIndicator>
            {items.map((item) => (
              <CartLineItem
                key={item.menuItemId}
                item={item}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                onRemove={onRemove}
              />
            ))}
          </ScrollView>
        )}

        <View style={footerStyle}>
          <View style={totalRowStyle}>
            <RNText style={totalLabelStyle}>Total</RNText>
            <RNText style={totalValueStyle} testID="cart-total">
              {formatPrice(total)}
            </RNText>
          </View>
          <Button
            title="Fazer Pedido"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isEmpty}
            onPress={handleCheckout}
            testID="cart-checkout-button"
          />
        </View>
      </Animated.View>
    </View>
  );
}

// ─── Sheet shell styles — mirror CalendarModal exactly ──────────────────────

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

const handleAreaStyle: ViewStyle = {
  width: '100%',
  alignItems: 'center',
  paddingTop: 12,
  paddingBottom: 12,
};

const handleStyle = (primaryColor: string): ViewStyle => ({
  width: 40,
  height: 4,
  borderRadius: 2,
  backgroundColor: primaryColor + '4D', // 30% opacity — same as CalendarModal
});
