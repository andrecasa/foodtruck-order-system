import React from 'react';
import { Redirect } from 'expo-router';

/**
 * Home tab — first item on the left of the bottom nav.
 *
 * For now it simply redirects to the "Pedidos" screen (the tab group's index
 * route). When a dedicated Home screen is designed, replace this redirect with
 * the actual screen component.
 */
export default function HomeRoute() {
  return <Redirect href="/(tabs)" />;
}
