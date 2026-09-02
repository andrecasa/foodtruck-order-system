import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerMenuScreen } from '../../../src/screens/customer/CustomerMenuScreen';
import { usePublicBranding } from '../../../src/hooks/customer/usePublicBranding';

/**
 * Public customer menu route: `/:slug/new-order` — "Novo Pedido".
 *
 * Renders the customer menu + cart. The `(public)` layout already resolves and
 * applies the tenant branding/theme; here we reuse `usePublicBranding` only to
 * surface the business name in the screen header. The slug comes from the route.
 */
export default function CustomerMenuRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { branding } = usePublicBranding(slug);

  return (
    <CustomerMenuScreen slug={slug} businessName={branding?.businessName} />
  );
}
