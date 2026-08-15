import React from 'react';
import { DailySummaryScreen } from '../../../src/screens/DailySummaryScreen';

/**
 * Full summary route — pushed from the intermediate summary screen
 * via the "Ver resumo completo" button.
 */
export default function FullSummary() {
  return <DailySummaryScreen />;
}
