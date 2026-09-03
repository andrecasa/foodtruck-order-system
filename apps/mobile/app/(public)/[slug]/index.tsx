import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ordersHref } from '../../../src/components/customer/customerNavHref';

/**
 * Public customer root route: `/:slug`.
 *
 * The PWA's entry point now lands on the orders list (`/:slug/orders`) instead
 * of the Home landing page. This route is a pure redirect that preserves the
 * tenant slug; the QrCode landing page lives at `/:slug/qrcode` and remains
 * reachable from the bottom nav's "QrCode" tab.
 */
export default function CustomerRootRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return <Redirect href={ordersHref(slug) as never} />;
}
