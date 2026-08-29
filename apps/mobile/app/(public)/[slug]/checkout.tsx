import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerCheckoutScreen } from '../../../src/screens/customer/CustomerCheckoutScreen';

/**
 * Public checkout route: `/:slug/checkout`.
 *
 * Renders the order confirmation screen. The `(public)` layout already resolves
 * and applies the tenant branding/theme; the slug comes from the route.
 */
export default function CustomerCheckoutRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return <CustomerCheckoutScreen slug={slug} />;
}
