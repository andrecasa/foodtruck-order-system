import React from 'react';
import { ScrollView, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Header, Button, HomeHero } from '../components';
import { useTheme } from '../theme';

/** Public ordering URL a customer reaches by scanning the QR code. */
function orderUrl(slug: string): string {
  return `https://order.foodtruck.app.br/${slug}`;
}

/**
 * Operator Home screen (`/(tabs)/home`).
 *
 * Mirrors the customer Home landing page — tenant logo, a QR code pointing to
 * the tenant's public ordering URL (so the operator can show it for a customer
 * to scan), a tagline, and a "Novo Pedido" button. Unlike the customer screen,
 * this one lives inside the authenticated operator flow: it uses the operator
 * `Header` (with the hamburger that opens the DrawerMenu) and relies on the
 * bottom tab navigator for navigation (no manual bottom nav).
 *
 * Branding (logo, businessName, slug) comes from the resolved theme
 * (`useTheme()`), populated after login from `GET /api/tenant/branding`. When
 * branding falls back to the neutral theme, `slug` is undefined and the QR card
 * is hidden (HomeHero omits it when `qrContent` is falsy).
 */
export function OperatorHomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
  };

  return (
    <Screen padding={false}>
      <Header title={theme.businessName || 'Início'} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator={false}
      >
        <HomeHero
          logo={theme.logo || undefined}
          qrContent={theme.slug ? orderUrl(theme.slug) : undefined}
          tagline={'QrCode para cliente fazer pedido\ne acompanhar pelo Aplicativo'}
          logoAccessibilityLabel={`Logo ${theme.businessName ?? ''}`.trim()}
        />

        <Button
          title="Novo Pedido"
          variant="primary"
          onPress={() => router.push('/(tabs)/new-order')}
          testID="home-new-order-button"
        />
      </ScrollView>
    </Screen>
  );
}
