import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { tokenStorage } from '../services/token-storage';
import { apiClient } from '../services/api-client';
import { authEvents } from '../services/auth-events';
import { themeCache } from '../services/theme-cache';
import { fetchTenantId } from '../theme/theme.config';

interface AuthUser {
  email: string;
  role?: 'admin' | 'atendente' | 'preparador';
}

interface AuthContextValue {
  user: AuthUser | null;
  /**
   * Resolved tenant id of the authenticated user, used to scope realtime
   * channels to this tenant (R12.7, R12.9). Null while unauthenticated or when
   * the tenant id could not be resolved.
   */
  tenantId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Authentication provider that manages login state and auto-redirects.
 * - On mount, checks for existing token and validates session
 * - Redirects to /login when unauthenticated
 * - Redirects to /(tabs) when authenticated and on login page
 * - Handles token expiration by clearing state and redirecting
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Check stored session on mount — validate with server
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const hasToken = await tokenStorage.isAuthenticated();
        if (hasToken) {
          const token = await tokenStorage.getAccessToken();
          if (token && !cancelled) {
            // Validate token with backend
            const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
            const res = await fetch(`${apiUrl}/api/auth/session`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              setUser({ email: data?.user?.email || '', role: 'admin' });
              // Resolve the tenant id so realtime channels can be scoped to
              // this tenant (R12.7, R12.9).
              const resolvedTenantId = await fetchTenantId(() => tokenStorage.getAccessToken());
              if (!cancelled) setTenantId(resolvedTenantId);
            } else {
              // Token invalid — clear session
              await tokenStorage.clear();
              setUser(null);
              setTenantId(null);
            }
          }
        }
      } catch {
        // Token expired or invalid
        await tokenStorage.clear();
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, []);

  // Listen for session expiration events (401 from API)
  useEffect(() => {
    const unsubscribe = authEvents.onSessionExpired(() => {
      setUser(null);
      setTenantId(null);
    });
    return unsubscribe;
  }, []);

  // Auto-redirect based on auth state
  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';

    if (!user && !inAuthGroup) {
      // Not authenticated, redirect to login
      router.replace('/login');
    } else if (user && inAuthGroup) {
      // Authenticated, redirect away from login
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading, router]);

  const login = useCallback(async (email: string, password: string) => {
    await apiClient.login(email, password);
    setUser({ email, role: 'admin' }); // Default to admin for prototype mode
    // Resolve the tenant id so realtime channels can be scoped to this tenant
    // (R12.7, R12.9).
    const resolvedTenantId = await fetchTenantId(() => tokenStorage.getAccessToken());
    setTenantId(resolvedTenantId);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Even if logout API fails, clear local state
    }
    await tokenStorage.clear();
    await themeCache.clear();
    setUser(null);
    setTenantId(null);
  }, []);

  const value: AuthContextValue = {
    user,
    tenantId,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {isLoading ? null : children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access authentication state and actions.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
