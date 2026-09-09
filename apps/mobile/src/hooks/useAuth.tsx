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

/**
 * Busca a sessão atual no backend e devolve o usuário (com o papel real
 * resolvido em `users.role`). Retorna `null` se não houver token válido.
 *
 * O papel é a autoridade para exibir/ocultar áreas restritas a admin no app
 * (ex.: itens de admin no DrawerMenu). Por isso ele vem sempre do backend, em
 * vez de assumido no cliente.
 */
async function fetchSessionUser(): Promise<AuthUser | null> {
  const token = await tokenStorage.getAccessToken();
  if (!token) return null;

  const apiUrl = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';
  const res = await fetch(`${apiUrl}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  return {
    email: data?.user?.email || '',
    role: data?.user?.role,
  };
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
        if (hasToken && !cancelled) {
          // Valida o token no backend e resolve o usuário (com o papel real).
          const sessionUser = await fetchSessionUser();
          if (sessionUser) {
            if (!cancelled) setUser(sessionUser);
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

    // Public route groups the customer can reach without authentication. The
    // customer-ordering flow lives in the `(public)` group (accessed via
    // `/:slug`), so it must NOT be redirected to /login when there is no user.
    // The password-recovery routes (`forgot-password`, `reset-password`) are
    // also public and must NOT be redirected to /login — an unauthenticated
    // user reaches them from the login screen (R1.3, R1.5).
    // Operator routes remain protected.
    const PUBLIC_GROUPS = ['login', '(public)', 'forgot-password', 'reset-password'];
    const inPublicRoute = PUBLIC_GROUPS.includes(segments[0]);

    if (!user && !inPublicRoute) {
      // Not authenticated on a protected (operator) route → go to login.
      router.replace('/login');
    } else if (user && segments[0] === 'login') {
      // Authenticated operator on the login page → send to the app.
      router.replace('/(tabs)');
    }
  }, [user, segments, isLoading, router]);

  const login = useCallback(async (email: string, password: string) => {
    // O endpoint de login já devolve o papel real do usuário (autoridade para
    // as áreas restritas a admin), então o usamos direto — sem request extra.
    const { role } = await apiClient.login(email, password);
    setUser({ email, role });
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
