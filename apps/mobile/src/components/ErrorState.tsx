import React from 'react';
import { View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Button } from './Button';

export interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Inline error state with retry button.
 * Automatically hides when the device is offline (since the global
 * ConnectionBanner already communicates that).
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const theme = useTheme();
  const { isOffline } = useNetworkStatus();

  // Don't show inline error when offline — the global banner handles it
  if (isOffline) {
    return null;
  }

  const containerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  const textStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: '400',
    color: theme.colors.error,
    textAlign: 'center',
  };

  return (
    <View style={containerStyle} testID="error-state">
      <RNText style={textStyle}>{message}</RNText>
      {onRetry && (
        <View style={{ marginTop: 16 }}>
          <Button title="Tentar novamente" onPress={onRetry} variant="primary" testID="retry-button" />
        </View>
      )}
    </View>
  );
}
