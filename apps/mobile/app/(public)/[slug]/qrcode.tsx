import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerQrCodeScreen } from '../../../src/screens/customer/CustomerQrCodeScreen';
import { usePublicBranding } from '../../../src/hooks/customer/usePublicBranding';

/**
 * Public customer QrCode route: `/:slug/qrcode`.
 *
 * Landing page showing the tenant logo, a QR code to the public ordering URL,
 * and a "Novo Pedido" button. The `(public)` layout already resolves and
 * applies the tenant branding/theme; here we reuse `usePublicBranding` to
 * surface the business name in the header. The slug comes from the route.
 *
 * The PWA's root (`/:slug`, `index.tsx`) redirects to the orders list, so the
 * QrCode page lives at this dedicated route and stays reachable from the bottom
 * nav's "QrCode" tab (see `qrcodeHref`).
 */
export default function CustomerQrCodeRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { branding } = usePublicBranding(slug);

  return <CustomerQrCodeScreen slug={slug} businessName={branding?.businessName} />;
}
