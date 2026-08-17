import React from 'react';
import * as fc from 'fast-check';
import { render } from '@testing-library/react-native';
import { MonthlySummaryCard } from '../../components/MonthlySummaryCard';
import { formatPrice, getPortugueseMonthName } from '../../utils/format';

jest.mock('../../theme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#7B2D2D',
      secondary: '#D4812B',
      background: '#FDF8F4',
      text: '#3D2020',
      textSecondary: '#8B6B5A',
      surface: '#FFFFFF',
      divider: '#E8DDD5',
      error: '#B54040',
      success: '#5A8C5A',
      warning: '#D4812B',
      aguardando: '#D4812B',
      preparando: '#5B8BA8',
      pronto: '#5A8C5A',
      received: '#2E7D32',
      pending: '#C62828',
      revenue: '#D4812B',
      surfacePrimary: '#FDF8F4',
      surfaceRevenue: '#FFF8F0',
      surfaceReceived: '#F0F8F0',
      surfacePending: '#FEF2F2',
    },
    typography: { fontFamily: 'Inter', sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 32 }, weights: { regular: 400, medium: 500, bold: 600 } },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    borderRadius: { sm: 8, md: 12, lg: 24, full: 9999 },
    businessName: 'Test',
  }),
}));

jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => ({
    colors: {
      primary: '#7B2D2D',
      secondary: '#D4812B',
      background: '#FDF8F4',
      text: '#3D2020',
      textSecondary: '#8B6B5A',
      surface: '#FFFFFF',
      divider: '#E8DDD5',
      error: '#B54040',
      success: '#5A8C5A',
      warning: '#D4812B',
      aguardando: '#D4812B',
      preparando: '#5B8BA8',
      pronto: '#5A8C5A',
      received: '#2E7D32',
      pending: '#C62828',
      revenue: '#D4812B',
      surfacePrimary: '#FDF8F4',
      surfaceRevenue: '#FFF8F0',
      surfaceReceived: '#F0F8F0',
      surfacePending: '#FEF2F2',
    },
    typography: { fontFamily: 'Inter', sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 32 }, weights: { regular: 400, medium: 500, bold: 600 } },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    borderRadius: { sm: 8, md: 12, lg: 24, full: 9999 },
    businessName: 'Test',
  }),
}));/**
 * Feature: summary-intermediate-screen, Property 1: Monthly Summary Card displays correct computed values
 *
 * For any valid MonthlySummaryResponse with non-negative totals, the Monthly Summary Card SHALL display:
 * Pedidos = totals.totalOrders (as integer),
 * Faturamento = formatPrice(totals.totalRevenue),
 * Recebido = formatPrice(totals.totalReceived),
 * Pendente = formatPrice(totals.totalPending),
 * and the title SHALL contain the correct Portuguese month name for the given month number.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */
describe('Feature: summary-intermediate-screen, Property 1: Monthly Summary Card displays correct computed values', () => {
  it('should display correct formatted values for any valid monthly summary', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 0, max: 9999 }),
        fc.integer({ min: 0, max: 999999 }),
        fc.integer({ min: 0, max: 999999 }),
        fc.integer({ min: 0, max: 999999 }),
        (month, totalOrders, totalRevenue, totalReceived, totalPending) => {
          const monthName = getPortugueseMonthName(month);

          const { getByLabelText, getByText, unmount } = render(
            <MonthlySummaryCard
              monthName={monthName}
              totalOrders={totalOrders}
              totalRevenue={totalRevenue}
              totalReceived={totalReceived}
              totalPending={totalPending}
            />
          );

          // Assert title contains correct Portuguese month name
          expect(getByText(`Acumulado em ${monthName}`)).toBeTruthy();

          // Assert Pedidos sub-card displays the integer count
          const pedidosLabel = `Pedidos: ${String(totalOrders)}`;
          expect(getByLabelText(pedidosLabel)).toBeTruthy();

          // Assert Faturamento sub-card displays formatted revenue
          const faturamentoLabel = `Faturamento: ${formatPrice(totalRevenue)}`;
          expect(getByLabelText(faturamentoLabel)).toBeTruthy();

          // Assert Recebido sub-card displays formatted received amount
          const recebidoLabel = `Recebido: ${formatPrice(totalReceived)}`;
          expect(getByLabelText(recebidoLabel)).toBeTruthy();

          // Assert Pendente sub-card displays formatted pending amount
          const pendenteLabel = `Pendente: ${formatPrice(totalPending)}`;
          expect(getByLabelText(pendenteLabel)).toBeTruthy();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
