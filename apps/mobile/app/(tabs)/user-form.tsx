import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { UserFormScreen } from '../../src/screens/UserFormScreen';

/**
 * Route: /user-form
 * Protected: only accessible by admin users.
 * Non-admin users are redirected to /(tabs) (order queue).
 */
export default function UserFormRoute() {
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

  return <UserFormScreen />;
}
