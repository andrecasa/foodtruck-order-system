import React from 'react';
import {
  Image,
  Text as RNText,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme';

export interface HomeHeroProps {
  /** Tenant logo URL. When falsy, the logo is omitted. */
  logo?: string;
  /**
   * Content encoded in the QR code (typically the public ordering URL). When
   * falsy, the QR card is omitted — e.g. when the tenant slug is unknown
   * (neutral branding fallback).
   */
  qrContent?: string;
  /** Tagline rendered below the QR code. */
  tagline: string;
  /** Accessibility label for the logo image. */
  logoAccessibilityLabel?: string;
}

/**
 * Builds a QR-code image URL for the given content. Rendered as a plain
 * `<Image>` so no extra dependency (svg / native module) is needed — works the
 * same in the PWA and on native.
 *
 * `color` tints the QR modules (the dark squares). The QR service expects the
 * hex WITHOUT the leading `#`, so we strip it here.
 */
function qrImageUrl(content: string, color: string, size = 240): string {
  const params = new URLSearchParams({
    size: `${size}x${size}`,
    data: content,
    margin: '0',
    color: color.replace('#', ''),
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;
}

/**
 * The visual "hero" of a Home screen: tenant logo, a card framing a QR code,
 * and a tagline below it. All colors come from the theme so it stays on-brand
 * per tenant.
 *
 * This is an independent copy of the customer Home's middle section, extracted
 * so the operator Home can reuse the same look while both screens evolve
 * separately.
 */
export function HomeHero({ logo, qrContent, tagline, logoAccessibilityLabel }: HomeHeroProps) {
  const theme = useTheme();

  const logoStyle: ImageStyle = {
    width: 125,
    height: 125,
  };

  // Card that frames the QR code. Uses the surface color so it reads as a panel
  // over the themed background.
  const qrCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.divider,
  };

  const qrStyle: ImageStyle = {
    width: 200,
    height: 200,
  };

  const taglineStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  };

  return (
    <>
      {/* Tenant logo — from the resolved theme branding. */}
      {logo ? (
        <Image
          source={{ uri: logo }}
          style={logoStyle}
          resizeMode="contain"
          accessibilityLabel={logoAccessibilityLabel}
          testID="home-logo"
        />
      ) : null}

      {/* QR code → public ordering URL for this tenant. */}
      {qrContent ? (
        <View style={qrCardStyle} testID="home-qr-card">
          <Image
            source={{ uri: qrImageUrl(qrContent, theme.colors.primary) }}
            style={qrStyle}
            resizeMode="contain"
            accessibilityLabel={`QR code para ${qrContent}`}
            testID="home-qr-image"
          />
        </View>
      ) : null}

      {/* Tagline below the QR code. */}
      <RNText style={taglineStyle} testID="home-tagline">
        {tagline}
      </RNText>
    </>
  );
}
