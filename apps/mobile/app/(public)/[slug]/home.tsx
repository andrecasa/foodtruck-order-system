import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerHomeScreen } from '../../../src/screens/customer/CustomerHomeScreen';
import { usePublicBranding } from '../../../src/hooks/customer/usePublicBranding';

/**
 * Public customer home route: `/:slug/home`.
 *
 * Landing page showing the tenant logo and a QR code to the public ordering
 * URL. The `(public)` layout already resolves and applies the tenant
 * branding/theme; here we reuse `usePublicBranding` to surface the business
 * name in the header. The slug comes from the route.
 */
export default function CustomerHomeRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { branding } = usePublicBranding(slug);

  return <CustomerHomeScreen slug={slug} businessName={branding?.businessName} />;
}
