import React from 'react';
import { RequestCodeScreen } from '../src/screens/RequestCodeScreen';

/**
 * /forgot-password route — renders the RequestCodeScreen.
 * This screen is outside the tab navigation (unauthenticated route),
 * following the same pattern as login.tsx.
 */
export default function ForgotPasswordRoute() {
  return <RequestCodeScreen />;
}
