import React from 'react';
import { ResetPasswordScreen } from '../src/screens/ResetPasswordScreen';

/**
 * /reset-password route — renders the ResetPasswordScreen.
 * This screen is outside the tab navigation (unauthenticated route),
 * following the same pattern as login.tsx.
 */
export default function ResetPasswordRoute() {
  return <ResetPasswordScreen />;
}
