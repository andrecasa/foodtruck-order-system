import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerTrackingScreen } from '../../../../src/screens/customer/CustomerTrackingScreen';

/**
 * Public order tracking route: `/:slug/pedido/:orderId`.
 *
 * Renders the realtime tracking screen. Both `slug` and `orderId` come from the
 * route params, so the screen works after a page reload. The `(public)` layout
 * already resolves and applies the tenant branding/theme.
 */
export default function CustomerTrackingRoute() {
  const { slug, orderId } = useLocalSearchParams<{ slug: string; orderId: string }>();

  return <CustomerTrackingScreen slug={slug} orderId={orderId} />;
}
