import React from 'react';
import { View, Text, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../theme';

const IS_PROTOTYPE_MODE = process.env.EXPO_PUBLIC_PROTOTYPE_MODE === 'true';

export interface PrototypeBannerProps {
  /** Whether the screen has an AppBar (56px). Affects clip top position. Defaults to true. */
  hasHeader?: boolean;
}

/**
 * Prototype indicator — diagonal ribbon in the top-right corner.
 * Pixel-perfect match to Penpot:
 * - Board 111×18px, rotated 45°, positioned at parentX:312 parentY:-13
 *   relative to 390px-wide screen, clipped by parent overflow.
 * - Fill: #D4812B (secondary), opacity 0.92, borderRadius 0
 * - Text: "PROTÓTIPO", Inter 9px, weight 600, letterSpacing 1, white
 * - Parent clips content (overflow hidden)
 *
 * Positioning:
 * - hasHeader=true (pages with AppBar): clip top=56px (below AppBar)
 * - hasHeader=false (login): clip top=0
 *
 * Strategy: An 80×80 clip wrapper (overflow hidden) positioned at the right edge.
 * The 111×18 rotated strip inside is empirically positioned to match the Penpot visual output.
 */
export function PrototypeBanner({ hasHeader = true }: PrototypeBannerProps) {
  const theme = useTheme();

  if (!IS_PROTOTYPE_MODE) {
    return null;
  }

  // Clipping container — positioned below AppBar (56px) or at top (0px) for login.
  const clipStyle: ViewStyle = {
    position: 'absolute',
    top: hasHeader ? 56 : 0,
    right: 0,
    width: 80,
    height: 80,
    overflow: 'hidden',
    zIndex: 100,
  };

  // The ribbon strip: 111×18, rotated 45°.
  // Penpot coords: parentX=312, parentY=-13 in a 390px screen with AppBar.
  // RN rotation differs from Penpot's coordinate system — empirically
  // adjusted to top=8, left=-8 to match the Penpot visual output
  // (ribbon visible below AppBar, overlapping first card).
  const ribbonStyle: ViewStyle = {
    position: 'absolute',
    top: 23,
    left: -8,
    width: 111,
    height: 18,
    backgroundColor: theme.colors.secondary, // #D4812B
    opacity: 0.92,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  };

  const textStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: '600',
    color: theme.colors.surface,
    letterSpacing: 1,
    lineHeight: 11, // ~1.2 * 9
  };

  return (
    <View style={clipStyle} pointerEvents="none" testID="prototype-banner">
      <View style={ribbonStyle} accessibilityLabel="Modo Protótipo ativo">
        <Text style={textStyle}>PROTÓTIPO</Text>
      </View>
    </View>
  );
}
