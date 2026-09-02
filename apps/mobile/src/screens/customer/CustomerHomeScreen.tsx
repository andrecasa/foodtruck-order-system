import React from 'react';
import {
  Image,
  ScrollView,
  Text as RNText,
  View,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { ordersHref, homeHref } from '../../components/customer/customerNavHref';

export interface CustomerHomeScreenProps {
  /** Tenant slug from the route (`/:slug/home`). */
  slug: string;
  /** Business name resolved from branding, shown in the header. */
  businessName?: string;
}

/** Public ordering URL a customer reaches by scanning the QR code. */
function orderUrl(slug: string): string {
  return `https://order.foodtruck.app.br/${slug}`;
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
 * Customer Home screen (`/:slug/home`).
 *
 * A simple landing page for the tenant's public ordering flow: the tenant logo
 * (from the resolved theme branding) and a card with a QR code that opens the
 * public ordering URL (`order.foodtruck.app.br/:slug`). All colors come from
 * the theme so it stays on-brand per tenant.
 */
export function CustomerHomeScreen({ slug, businessName }: CustomerHomeScreenProps) {
  const theme = useTheme();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 32,
  };

  const logoStyle: ImageStyle = {
    width: 175,
    height: 175,
    borderRadius: 16,
  };

  // Card that frames the QR code. Uses the surface color so it reads as a panel
  // over the themed background.
  const qrCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.divider,
  };

  const qrStyle: ImageStyle = {
    width: 240,
    height: 240,
  };

  const taglineStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: '400',
    color: theme.colors.textSecondary,
    textAlign: 'center',
  };

  return (
    <SafeAreaView style={containerStyle} edges={['top', 'bottom']}>
      <CustomerHeader title={businessName ?? 'Início'} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      >
        {/* Tenant logo — from the resolved theme branding. */}
        {theme.logo ? (
          <Image
            source={{ uri: theme.logo }}
            style={logoStyle}
            resizeMode="contain"
            accessibilityLabel={`Logo ${businessName ?? ''}`.trim()}
            testID="home-logo"
          />
        ) : null}

        {/* QR code → public ordering URL for this tenant. */}
        <View style={qrCardStyle} testID="home-qr-card">
          <Image
            source={{ uri: qrImageUrl(orderUrl(slug), theme.colors.primary) }}
            style={qrStyle}
            resizeMode="contain"
            accessibilityLabel={`QR code para ${orderUrl(slug)}`}
            testID="home-qr-image"
          />
        </View>

        {/* Tagline below the QR code. */}
        <RNText style={taglineStyle} testID="home-tagline">
          Faça você mesmo seu pedido{'\n'}e acompanhe pelo Aplicativo!
        </RNText>
      </ScrollView>

      <CustomerBottomNav slug={slug} active="home" homeHref={homeHref(slug)} pedidosHref={ordersHref(slug)} />
    </SafeAreaView>
  );
}
