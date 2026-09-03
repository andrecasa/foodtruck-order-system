import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { EditMenuItemScreen } from '../src/screens/EditMenuItemScreen';

/**
 * Edit Menu Item route — opened from MenuScreen when tapping an existing item.
 *
 * Usage: router.push({ pathname: '/(tabs)/edit-menu-item', params: { id, name, price: String(price), category } })
 *
 * Route params:
 * - id: string — menu item ID
 * - name: string — current item name
 * - price: string — current price in centavos (as string)
 * - category: string — current category
 */
export default function EditMenuItemRoute() {
  const params = useLocalSearchParams<{
    id: string;
    name: string;
    price: string;
    category: string;
  }>();

  return (
    <EditMenuItemScreen
      id={params.id ?? ''}
      name={params.name ?? ''}
      price={Number(params.price) || 0}
      category={params.category ?? ''}
    />
  );
}
