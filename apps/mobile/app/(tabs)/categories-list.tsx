import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { CategoriesListScreen } from '../../src/screens/CategoriesListScreen';

/**
 * Route: /categories-list
 * Protected: only accessible by admin users.
 * Non-admin users are redirected to /(tabs) (order queue).
 */
export default function CategoriesListRoute() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'admin') {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || user.role !== 'admin') {
    return null;
  }

  return <CategoriesListScreen />;
}
