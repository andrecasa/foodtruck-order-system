import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * Fixed red banner shown when the device is offline.
 * Matches the web ConnectionBanner design.
 */
export function ConnectionBanner() {
  const theme = useTheme();

  const bannerStyle: ViewStyle = {
    width: '100%',
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.error,
  };

  const iconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: theme.colors.surface,
  };

  const textStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.surface,
  };

  return (
    <View style={bannerStyle} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <Text style={iconStyle}>wifi_off</Text>
      <Text style={textStyle}>Sem conexão com a internet</Text>
    </View>
  );
}
