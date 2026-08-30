import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerOrdersScreen } from '../../../src/screens/customer/CustomerOrdersScreen';

/**
 * Public orders-list route: `/:slug/pedidos`.
 *
 * Renders "Meus Pedidos" — every order placed by the customer in this session.
 * The `(public)` layout already resolves and applies the tenant branding/theme;
 * the slug comes from the route.
 */
export default function CustomerOrdersRoute() {
  const { slug } = useLocalSearchParams<{ slug: string }>();

  return <CustomerOrdersScreen slug={slug} />;
}
