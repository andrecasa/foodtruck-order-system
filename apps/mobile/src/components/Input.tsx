import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  type TextStyle,
  type ViewStyle,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type InputMask = 'currency' | 'none';

export interface InputProps {
  /** Label text displayed above the input (optional — omit to hide visual label) */
  label?: string;
  /** Accessibility label for the input (defaults to label if provided) */
  accessibilityLabel?: string;
  /** Current input value */
  value: string;
  /** Callback when text changes */
  onChangeText: (text: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Input mask type */
  mask?: InputMask;
  /** Optional test ID for testing */
  testID?: string;
  /** Optional keyboard type override (defaults to 'numeric' for currency mask) */
  keyboardType?: TextInputProps['keyboardType'];
  /** Whether to hide text input (for passwords) */
  secureTextEntry?: boolean;
  /** Auto-capitalization behavior */
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** Optional leading icon name (Material Symbols Outlined) */
  icon?: string;
  /** Optional icon color override (defaults to textSecondary #8B6B5A) */
  iconColor?: string;
  /** Optional background color override (defaults to #F5F5F5) */
  backgroundColor?: string;
  /** Show a trailing toggle icon for password visibility (eye icon) */
  showPasswordToggle?: boolean;
}

/**
 * Formats a raw digit string as Brazilian Real currency (R$ X,XX).
 * Only keeps digits and formats with comma as decimal separator.
 */
function formatCurrency(raw: string): string {
  // Strip non-digit characters
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  // Pad with leading zeros to have at least 3 digits (for cents)
  const padded = digits.padStart(3, '0');

  // Split into integer and decimal parts
  const integerPart = padded.slice(0, padded.length - 2);
  const decimalPart = padded.slice(padded.length - 2);

  // Remove leading zeros from integer part, keeping at least one digit
  const trimmedInteger = integerPart.replace(/^0+/, '') || '0';

  return `R$ ${trimmedInteger},${decimalPart}`;
}

/**
 * Extracts only digits from a formatted currency string.
 */
function extractDigits(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

/**
 * Themed Input component for React Native.
 * Pixel-perfect match to Penpot Design System.
 *
 * Penpot specs (Input / Login variant):
 * - Wrapper: column, gap 8px
 * - Label: 12px weight 400, color text (#3D2020)
 * - Field: border-radius 24px, height 52px, padding 0 16px, gap 10px
 *   - Default: bg #FFFFFF, border 1px solid #E8DDD5 (divider)
 *   - Focus: bg #FFFFFF, border 1px solid #7B2D2D (primary)
 *   - Error: bg #FFFFFF, border 1px solid #B54040 (error)
 * - Placeholder: 14px weight 400, color #8B6B5A (textSecondary)
 * - Leading icon: Material Symbols Outlined, 20px, color #8B6B5A
 * - Trailing icon (password toggle): Material Symbols "visibility", 20px, color #8B6B5A
 */
export function Input({
  label,
  accessibilityLabel,
  value,
  onChangeText,
  placeholder,
  error,
  disabled = false,
  mask = 'none',
  testID,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  icon,
  iconColor,
  backgroundColor,
  showPasswordToggle = false,
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const handleChangeText = (text: string): void => {
    if (mask === 'currency') {
      // Extract only digits and reformat
      const digits = extractDigits(text);
      if (digits.length === 0) {
        onChangeText('');
        return;
      }
      onChangeText(formatCurrency(digits));
    } else {
      onChangeText(text);
    }
  };

  const resolvedKeyboardType = keyboardType ?? (mask === 'currency' ? 'numeric' : 'default');

  const containerStyle: ViewStyle = {
    gap: 8,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const inputWrapperStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: backgroundColor ?? '#FFFFFF',
    borderWidth: 1,
    borderColor: error ? theme.colors.error : isFocused ? theme.colors.primary : '#E8DDD5',
    borderRadius: 24,
    height: 52,
    paddingHorizontal: 16,
    gap: 10,
  };

  const iconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    fontWeight: '400',
    color: iconColor ?? '#8B6B5A',
  };

  const inputStyle: TextStyle = {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: disabled ? `${theme.colors.text}80` : theme.colors.text,
    paddingVertical: 0,
    height: 52,
  };

  const trailingIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 20,
    fontWeight: '400',
    color: '#8B6B5A',
  };

  const errorStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.xs,
    fontWeight: '400',
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  };

  return (
    <View style={containerStyle} testID={testID}>
      {label ? (
        <Text
          style={labelStyle}
          accessibilityRole="text"
        >
          {label}
        </Text>
      ) : null}
      <View style={inputWrapperStyle}>
        {icon ? (
          <Text
            style={iconStyle}
            accessibilityElementsHidden
            importantForAccessibility="no"
          >
            {icon}
          </Text>
        ) : null}
        <TextInput
          style={inputStyle}
          value={value}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8B6B5A"
          editable={!disabled}
          keyboardType={resolvedKeyboardType}
          secureTextEntry={showPasswordToggle ? !passwordVisible : secureTextEntry}
          autoCapitalize={autoCapitalize}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled }}
          accessibilityHint={error ? `Erro: ${error}` : undefined}
        />
        {showPasswordToggle ? (
          <Pressable
            onPress={() => setPasswordVisible((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Ocultar senha' : 'Exibir senha'}
            hitSlop={8}
          >
            <Text style={trailingIconStyle}>
              {passwordVisible ? 'visibility_off' : 'visibility'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text
          style={errorStyle}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
