import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  /** Button label text */
  title: string;
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size: lg (44px, main CTA), md (default 40px), or sm (36px, in-card) */
  size?: ButtonSize;
  /** Callback when button is pressed */
  onPress?: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether to show a loading spinner */
  loading?: boolean;
  /** Custom background color override (e.g. for status-colored buttons) */
  color?: string;
  /** Whether button should stretch full width (for form CTAs) */
  fullWidth?: boolean;
  /** Optional test ID for testing */
  testID?: string;
}

/**
 * Button component — pixel-perfect match to Penpot Design System.
 *
 * Penpot specs:
 * - lg (main CTA): border-radius 22px, height 44px, padding 0 20px, font 14px weight 400
 * - md (default): border-radius 20px, height 40px, padding 0 20px, font 14px weight 400
 * - sm (in-card): border-radius 18px, height 36px, padding 0 16px, font 12px weight 400
 *
 * Filled: bg varies by variant/status, text #FFFFFF
 * Outlined: bg transparent, stroke 1px solid #8B6B5A inner, text #8B6B5A
 * Disabled: bg #E8DDD5, text #9E9E9E, no stroke
 */
export function Button({
  title,
  variant = 'primary',
  size = 'md',
  onPress,
  disabled = false,
  loading = false,
  color,
  fullWidth = false,
  testID,
}: ButtonProps) {
  const theme = useTheme();

  const isOutline = variant === 'outline';

  const getBackgroundColor = (): string => {
    if (disabled) return '#E8DDD5';
    if (isOutline) return 'transparent';
    if (color) return color;
    switch (variant) {
      case 'primary':
        return theme.colors.primary;
      case 'secondary':
        return theme.colors.secondary;
      case 'danger':
        return theme.colors.error;
      default:
        return theme.colors.primary;
    }
  };

  const getTextColor = (): string => {
    if (disabled) return '#9E9E9E';
    switch (variant) {
      case 'outline':
        return color || '#8B6B5A';
      default:
        return '#FFFFFF';
    }
  };

  const getBorderColor = (): string => {
    if (disabled) return 'transparent';
    if (variant === 'outline') return color || '#8B6B5A';
    return 'transparent';
  };

  const getHeight = (): number => {
    switch (size) {
      case 'lg': return 44;
      case 'sm': return 36;
      default: return 40;
    }
  };

  const getBorderRadius = (): number => {
    switch (size) {
      case 'lg': return 22;
      case 'sm': return 18;
      default: return 20;
    }
  };

  const containerStyle: ViewStyle = {
    backgroundColor: getBackgroundColor(),
    borderColor: getBorderColor(),
    borderWidth: isOutline ? 1 : 0,
    borderRadius: getBorderRadius(),
    paddingHorizontal: size === 'sm' ? 16 : 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    height: getHeight(),
    alignSelf: fullWidth ? 'stretch' : 'center', // Penpot: in-card buttons centered, form CTAs full-width
  };

  const textStyle: TextStyle = {
    color: getTextColor(),
    fontFamily: theme.typography.fontFamily,
    fontSize: size === 'sm' ? 12 : 14,
    fontWeight: '400', // Penpot: all sizes use weight 400
  };

  const spinnerColor = variant === 'outline' ? '#8B6B5A' : '#FFFFFF';

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      accessibilityLabel={title}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          color={spinnerColor}
          size="small"
          style={{ marginRight: 6 }}
        />
      ) : null}
      {!loading && <Text style={textStyle}>{title}</Text>}
    </TouchableOpacity>
  );
}
