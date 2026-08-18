import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

/**
 * Offline empty state illustration — matches Penpot "Sem Conexão com Internet" design.
 * Uses the same visual language as the "Fila de Pedidos Vazia" empty state,
 * but with error red (#B54040) color scheme and wifi_off icon.
 */
export function OfflineIllustration() {
  const theme = useTheme();
  const errorColor = theme.colors.error; // #B54040

  const containerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  const illustrationStyle: ViewStyle = {
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    width: 240,
    height: 220,
    justifyContent: 'center',
  };

  // Decorative dots
  const dotStyle = (top: number, left: number, size: number, color: string, opacity: number): ViewStyle => ({
    position: 'absolute',
    top,
    left,
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    opacity,
  });

  // Receipt card background
  const receiptBgStyle: ViewStyle = {
    width: 120,
    height: 150,
    borderRadius: 12,
    backgroundColor: errorColor + '14', // 8% opacity
    borderWidth: 1.5,
    borderColor: errorColor + '4D', // 30% opacity
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Receipt inner white card
  const receiptInnerStyle: ViewStyle = {
    width: 100,
    height: 130,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  };

  // Placeholder lines
  const lineStyle = (width: number, opacity: number): ViewStyle => ({
    width,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: errorColor,
    opacity,
  });

  // Icon circle
  const circleStyle: ViewStyle = {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: errorColor + '1F', // 12% opacity
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  };

  const iconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    color: errorColor,
    opacity: 0.6,
  };

  const labelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    opacity: 0.8,
  };

  const sublabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 11,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    opacity: 0.5,
  };

  return (
    <View style={containerStyle}>
      <View style={illustrationStyle}>
        {/* Decorative dots */}
        <View style={dotStyle(40, 20, 8, errorColor, 0.25)} />
        <View style={dotStyle(100, 5, 6, theme.colors.textSecondary, 0.2)} />
        <View style={dotStyle(35, 195, 7, errorColor, 0.3)} />
        <View style={dotStyle(110, 210, 5, theme.colors.secondary, 0.2)} />
        <View style={dotStyle(160, 25, 6, errorColor, 0.15)} />
        <View style={dotStyle(155, 195, 8, theme.colors.textSecondary, 0.25)} />

        {/* Receipt card */}
        <View style={receiptBgStyle}>
          <View style={receiptInnerStyle}>
            <View style={lineStyle(60, 0.15)} />
            <View style={lineStyle(50, 0.12)} />
            <View style={lineStyle(35, 0.08)} />
          </View>
        </View>

        {/* Icon circle */}
        <View style={circleStyle}>
          <Text style={iconStyle}>wifi_off</Text>
        </View>
      </View>

      {/* Text labels */}
      <Text style={labelStyle}>Sem conexão com a internet</Text>
      <Text style={sublabelStyle}>Verifique sua rede e tente novamente</Text>
    </View>
  );
}
