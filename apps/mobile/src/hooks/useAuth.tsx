import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { tokenStorage } from '../services/token-storage';
import { apiClient } from '../services/api-client';

interface AuthUser {
  email: string;
  role?: 'admin' | 'atendente' | 'preparador';
}

interface AuthContextValue {
  user: AuthUser | null;
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
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  // Check stored session on mount
  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const hasToken = await tokenStorage.isAuthenticated();
        if (hasToken) {
          // We have a valid token — set user from stored info
          const token = await tokenStorage.getAccessToken();
          if (token && !cancelled) {
            setUser({ email: '', role: 'admin' }); // Default to admin for prototype mode
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
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Even if logout API fails, clear local state
    }
    await tokenStorage.clear();
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
