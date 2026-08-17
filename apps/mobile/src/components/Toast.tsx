import React from 'react';
import { Text, TouchableOpacity, View, type TextStyle, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ToastProps {
  message: string | null;
  visible: boolean;
  onDismiss?: () => void;
  type?: 'error' | 'info';
}

/**
 * Simple toast notification component.
 * Appears at the top of the screen with error/info styling.
 */
export function Toast({ message, visible, onDismiss, type = 'error' }: ToastProps) {
  const theme = useTheme();

  if (!visible || !message) return null;

  const containerStyle: ViewStyle = {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: type === 'error' ? theme.colors.error : theme.colors.primary,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 9999,
  };

  const textStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.surface,
    flex: 1,
  };

  const dismissTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.surface,
    marginLeft: 12,
    opacity: 0.8,
  };

  return (
    <View style={containerStyle} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={textStyle}>{message}</Text>
      {onDismiss && (
        <TouchableOpacity onPress={onDismiss} accessibilityLabel="Fechar notificação">
          <Text style={dismissTextStyle}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
