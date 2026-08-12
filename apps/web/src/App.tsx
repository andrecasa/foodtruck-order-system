import React, { useState } from 'react';
import { LoginPage } from './pages/LoginPage';
import { QueuePage } from './pages/QueuePage';

/**
 * Root App component with simple state-based routing.
 * Toggles between Login and Queue pages based on auth state.
 * No router library needed — just a boolean flag.
 */
export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return <QueuePage onLogout={() => setIsAuthenticated(false)} />;
}
