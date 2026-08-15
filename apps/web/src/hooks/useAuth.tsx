import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiClient } from '../services/api-client';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

interface AuthUser {
  email: string;
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
  const [isLoading, setIsLoading] = useState(true);

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
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await apiClient.login(email, password);
    setUser({ email });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
    } catch {
      // Even if the API call fails, clear local state
    }
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
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
 * Must be used within an AuthProvider.
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
