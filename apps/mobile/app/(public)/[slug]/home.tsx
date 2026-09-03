import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerHomeScreen } from '../../../src/screens/customer/CustomerHomeScreen';
import { usePublicBranding } from '../../../src/hooks/customer/usePublicBranding';

/**
 * Public customer landing route: `/:slug/home`.
 *
 * Landing page showing the tenant logo, a QR code to the public ordering URL,
 * and a "Novo Pedido" button. The `(public)` layout already resolves and
 * applies the tenant branding/theme; here we reuse `usePublicBranding` to
 * surface the business name in the header. The slug comes from the route.
 *
 * The PWA's root (`/:slug`, `index.tsx`) redirects to the orders list, so the
 * Home now lives at this dedicated route and stays reachable from the bottom
 * nav's "Home" tab (see `homeHref`).
 */
export default function CustomerHomeRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { branding } = usePublicBranding(slug);

  return <CustomerHomeScreen slug={slug} businessName={branding?.businessName} />;
}
