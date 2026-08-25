import React from 'react';
import { Pressable, Text as RNText, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface FloatingButtonProps {
  /** Button label */
  label: string;
  /** Callback when pressed */
  onPress: () => void;
  /** Optional icon text (Material Symbols glyph) */
  icon?: string;
  /** Distance from the bottom edge (default: 16). Use 72 when above BottomNav. */
  bottomOffset?: number;
  /** Optional test ID */
  testID?: string;
  /** Optional accessibility label override */
  accessibilityLabel?: string;
  /** Optional accessibility hint */
  accessibilityHint?: string;
}

/**
 * Floating Action Button — pill-shaped, fixed at the bottom of the screen.
 *
 * Must be placed inside a container with `flex: 1` (e.g. a View wrapping ScrollContainer).
 * Uses position absolute to float above content.
 *
 * Specs:
 * - height: 44px, borderRadius: 22px (pill)
 * - bg: primary, text: surface
 * - position: absolute, bottom: 16, left: 16, right: 16
 * - No shadow (consistent with app patterns)
 */
export function FloatingButton({
  label,
  onPress,
  icon,
  bottomOffset = 16,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: FloatingButtonProps) {
  const theme = useTheme();

  const containerStyle: ViewStyle = {
    position: 'absolute',
    bottom: bottomOffset,
    left: 16,
    right: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: 22,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };

  return (
    <Pressable
      style={containerStyle}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      testID={testID}
    >
      {icon ? (
        <RNText
          style={{
            fontFamily: 'Material Symbols Outlined',
            fontSize: 18,
            color: theme.colors.surface,
          }}
        >
          {icon}
        </RNText>
      ) : null}
      <RNText
        style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: 14,
          fontWeight: '400',
          color: theme.colors.surface,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}
