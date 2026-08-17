import React from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme';

interface ToggleSwitchProps {
  value: boolean;
  onValueChange: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Custom Switch Toggle — pixel-perfect match to Penpot design.
 *
 * Penpot specs:
 * - Track: 44×24px, borderRadius 12 (pill)
 * - Active track: #7B2D2D (primary)
 * - Inactive track: #E8DDD5 (divider)
 * - Thumb: 20×20px circle, white, shadow 0 1px 2px rgba(0,0,0,0.2)
 * - Thumb position: 2px padding from track edge
 */
export function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  testID,
}: ToggleSwitchProps) {
  const theme = useTheme();

  const trackStyle: ViewStyle = {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: value ? theme.colors.primary : theme.colors.divider,
    justifyContent: 'center',
    paddingHorizontal: 2,
    opacity: disabled ? 0.5 : 1,
  };

  const thumbStyle: ViewStyle = {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    alignSelf: value ? 'flex-end' : 'flex-start',
    // Shadow
  };

  return (
    <Pressable
      onPress={disabled ? undefined : onValueChange}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={trackStyle}
    >
      <View style={thumbStyle} />
    </Pressable>
  );
}
