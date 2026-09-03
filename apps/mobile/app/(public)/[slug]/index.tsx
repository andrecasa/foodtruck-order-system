import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { menuHref } from '../../../src/components/customer/customerNavHref';

/**
 * Public customer root route: `/:slug`.
 *
 * The PWA's entry point now lands on the new-order screen (`/:slug/new-order`)
 * instead of the Home landing page. This route is a pure redirect that
 * preserves the tenant slug; the Home landing page lives at `/:slug/home` and
 * remains reachable from the bottom nav's "Home" tab.
 */
export default function CustomerRootRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return <Redirect href={menuHref(slug) as never} />;
}
