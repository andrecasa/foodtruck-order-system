import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/api-client';
import { fetchTenantBranding, fetchTenantId, useThemeActions } from '../theme';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

interface AuthUser {
  email: string;
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
 * Authentication provider for the web Preparador app.
 * - On mount, checks sessionStorage for existing token
 * - If token found, considers user authenticated (session restore)
 * - login() calls apiClient.login() and updates state
 * - logout() calls apiClient.logout() and clears state
 * - 401 errors from the real-client automatically clear the token;
 *   components should check isAuthenticated to redirect to login
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { setTheme, resetTheme } = useThemeActions();

  // Fetches the authenticated tenant's branding and applies it over the neutral
  // theme. On any failure/timeout, fetchTenantBranding resolves to the neutral
  // default, so the app stays usable (R7.2, R7.3, R7.8, R11.7). Also resolves
  // the tenant id so realtime channels can be scoped to this tenant (R12.7,
  // R12.9).
  const applyTenantBranding = useCallback(
    async (token: string) => {
      const [theme, resolvedTenantId] = await Promise.all([
        fetchTenantBranding(token),
        fetchTenantId(token),
      ]);
      setTheme(theme);
      setTenantId(resolvedTenantId);
    },
    [setTheme],
  );

  // Check for existing session on mount — validate with server
  useEffect(() => {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (token) {
      // Token exists — validate by calling the session endpoint
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
      fetch(`${apiUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) {
            return res.json();
          }
          throw new Error('Invalid session');
        })
        .then((data) => {
          setUser({ email: data?.user?.email || '' });
          // Apply tenant branding after restoring the session (R7.2, R7.3).
          void applyTenantBranding(token);
        })
        .catch(async () => {
          // Token invalid — try refresh before giving up
          const refreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY);
          if (refreshToken) {
            try {
              const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
              const refreshRes = await fetch(`${apiUrl}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
              });
              if (refreshRes.ok) {
                const data = await refreshRes.json();
                sessionStorage.setItem(TOKEN_KEY, data.accessToken);
                sessionStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
                // Validate the new token
                const sessionRes = await fetch(`${apiUrl}/api/auth/session`, {
                  headers: { Authorization: `Bearer ${data.accessToken}` },
                });
                if (sessionRes.ok) {
                  const sessionData = await sessionRes.json();
                  setUser({ email: sessionData?.user?.email || '' });
                  // Apply tenant branding after a successful token refresh (R7.2, R7.3).
                  void applyTenantBranding(data.accessToken);
                  return;
                }
              }
            } catch {
              // Refresh failed
            }
          }
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(REFRESH_TOKEN_KEY);
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
    // Run once on mount; applyTenantBranding is stable via useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { token } = await apiClient.login(email, password);
      setUser({ email });
      // Fetch and apply the tenant branding before authenticated screens render
      // (R7.2). On failure/timeout the neutral theme is kept (R7.8, R11.7).
      await applyTenantBranding(token);
    },
    [applyTenantBranding],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Even if the API call fails, clear local state
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setTenantId(null);
    // Return to the neutral platform branding once no tenant is authenticated (R11.6).
    resetTheme();
  }, [resetTheme]);

  const value: AuthContextValue = {
    user,
    tenantId,
    isLoading,
    isAuthenticated: user !== null,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access authentication state and actions.
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
