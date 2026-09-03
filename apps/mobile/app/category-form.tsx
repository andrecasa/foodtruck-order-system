import React, { useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import { CategoryFormScreen } from '../src/screens/CategoryFormScreen';

/**
 * Route: /category-form
 * Protected: only accessible by admin users.
 * Non-admin users are redirected to /(tabs) (order queue).
 *
 * Route params (optional, for edit mode):
 * - id: string — category ID (presence indicates edit mode)
 * - name: string — current category name (pre-fill)
 */
export default function CategoryFormRoute() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'admin') {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'admin') {
    return null;
  }

  return <CategoryFormScreen id={params.id} name={params.name} />;
}
