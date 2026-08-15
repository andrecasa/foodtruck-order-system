import React from 'react';
import * as fc from 'fast-check';
import { render } from '@testing-library/react-native';
import { SelectedDayCard } from '../../components/SelectedDayCard';
import { formatPrice, formatSelectedDate } from '../../utils/format';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

// ─── Test ───────────────────────────────────────────────────────────────────

/**
 * Feature: summary-intermediate-screen, Property 2: Selected Day Card displays correct derived values
 *
 * For any valid date (day, month, year) and day summary data, the Selected Day Card SHALL display:
 * the date formatted as "[day] de [MonthName], [year]", Pedidos = orderCount,
 * Faturamento = formatPrice(revenue), and Pagos = "[paidOrders]/[totalOrders]".
 *
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 2: Selected Day Card displays correct derived values', () => {
  it('renders correct date format, order count, formatted revenue, and paid/total ratio for any valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2020, max: 2030 }),   // year
        fc.integer({ min: 1, max: 12 }),         // month (1-based)
        fc.integer({ min: 1, max: 28 }),         // day (safe range)
        fc.integer({ min: 0, max: 999 }),        // orderCount
        fc.integer({ min: 0, max: 999999 }),     // revenue (cents)
        fc.integer({ min: 0, max: 999 }),        // paidOrders
        (year, month, day, orderCount, revenue, paidOrders) => {
          // totalOrders must be >= paidOrders
          const totalOrders = orderCount > paidOrders ? orderCount : paidOrders;

          const date = new Date(year, month - 1, day);

          const { getByText, unmount } = render(
            React.createElement(SelectedDayCard, {
              date,
              orderCount,
              revenue,
              paidOrders,
              totalOrders,
              onViewFullSummary: jest.fn(),
            })
          );

          // Assert: date formatted as "[day] de [MonthName], [year]"
          const expectedDateText = formatSelectedDate(day, month, year);
          expect(getByText(expectedDateText)).toBeTruthy();

          // Assert: orderCount displayed
          expect(getByText(String(orderCount))).toBeTruthy();

          // Assert: formatPrice(revenue) displayed
          const expectedRevenue = formatPrice(revenue);
          expect(getByText(expectedRevenue)).toBeTruthy();

          // Assert: "[paidOrders]/[totalOrders]" displayed
          const expectedPagos = `${paidOrders}/${totalOrders}`;
          expect(getByText(expectedPagos)).toBeTruthy();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  }, 60_000);
});
