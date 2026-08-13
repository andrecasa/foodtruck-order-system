import React from 'react';
import { AuthProvider, useAuth } from './hooks';
import { LoginPage } from './pages/LoginPage';
import { QueuePage } from './pages/QueuePage';

/**
 * Inner component that reads auth state and renders the appropriate page.
 */
function AppContent() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null; // Brief flash while checking sessionStorage
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <QueuePage />;
}

/**
 * Root App component wrapped with AuthProvider.
 * Uses useAuth hook for state-based routing between Login and Queue pages.
 */
export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
