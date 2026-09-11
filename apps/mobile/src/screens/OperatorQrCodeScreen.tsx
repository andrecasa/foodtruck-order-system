import React from 'react';
import { ScrollView, type ViewStyle } from 'react-native';
import { Screen, Header, HomeHero } from '../components';
import { useTheme } from '../theme';

/** Public ordering URL a customer reaches by scanning the QR code. */
function orderUrl(slug: string): string {
  return `https://order.foodtruck.app.br/${slug}`;
}

/**
 * Operator QrCode screen (`/(tabs)/qrcode`).
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
export function OperatorQrCodeScreen() {
  const theme = useTheme();

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
  };

  return (
    // Aba dentro do navegador de abas: a bottom nav já reserva insets.bottom,
    // então o container não aplica o inset inferior (evita padding extra no fim
    // do scroll que só aparece no device).
    <Screen padding={false} edges={['top']}>
      {/* Aba raiz: exibe o menu hambúrguer (sem seta de voltar), padronizando
          com as demais abas (Pedidos, Novo Pedido, Resumo). */}
      <Header title={theme.businessName || 'QrCode'} />

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

      </ScrollView>
    </Screen>
  );
}
