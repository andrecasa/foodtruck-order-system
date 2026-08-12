import React from 'react';
import { LoginScreen } from '../src/screens/LoginScreen';

/**
 * /login route — renders the LoginScreen.
 * This screen is outside the tab navigation (unauthenticated route).
 */
export default function LoginRoute() {
  return <LoginScreen />;
}
