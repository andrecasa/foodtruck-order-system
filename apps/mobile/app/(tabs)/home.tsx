import React from 'react';
import { OperatorHomeScreen } from '../../src/screens/OperatorHomeScreen';

/**
 * Home tab — first item on the left of the bottom nav.
 *
 * Landing page mirroring the customer Home: tenant logo, a QR code to the
 * public ordering URL, and a "Novo Pedido" button.
 */
export default function HomeRoute() {
  return <OperatorHomeScreen />;
}
