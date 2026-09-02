import React from 'react';
import { CreateMenuItemScreen } from '../../src/screens/CreateMenuItemScreen';

/**
 * Create Menu Item route — opened from MenuScreen's "Novo Item" button.
 *
 * Usage: router.push('/(tabs)/create-menu-item')
 */
export default function CreateMenuItemRoute() {
  return <CreateMenuItemScreen />;
}
