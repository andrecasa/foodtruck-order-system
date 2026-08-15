import React from 'react';
import * as fc from 'fast-check';
import { render } from '@testing-library/react-native';
import { CalendarCard } from '../../components/CalendarCard';
import { getDaysInMonth } from '../../utils/calendar';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return RN;
});

// ─── Test ───────────────────────────────────────────────────────────────────

/**
 * Feature: summary-intermediate-screen, Property 4: Order indicator circles match per-day breakdown
 *
 * For any per-day breakdown array and rendered calendar, the set of days displaying
 * an order indicator circle (outline) SHALL be exactly equal to the set of day numbers
 * present in the breakdown array.
 *
 * Design update: dots were replaced by outline circles. Days with orders get an
 * amber (#D4812B) circle outline; the selected day gets a green (#598C59) circle outline.
 * All days with orders or selected are tappable and rendered with testID `calendar-day-${day}`.
 *
 * **Validates: Requirements 6.3**
 */
describe('Property 4: Order indicator circles match per-day breakdown', () => {
  // Generator: random year, month, and a subset of valid days for that month as daysWithOrders
  const calendarWithOrdersArb = fc
    .integer({ min: 2020, max: 2030 })
    .chain((year) =>
      fc.integer({ min: 1, max: 12 }).chain((month) => {
        const daysInMonth = getDaysInMonth(year, month);
        // Generate a subset of valid days (1..daysInMonth) as days with orders
        return fc
          .subarray(
            Array.from({ length: daysInMonth }, (_, i) => i + 1),
            { minLength: 0, maxLength: daysInMonth }
          )
          .map((daysWithOrders) => ({ year, month, daysWithOrders, daysInMonth }));
      })
    );

  it('days with orders are rendered as tappable cells', () => {
    fc.assert(
      fc.property(calendarWithOrdersArb, ({ year, month, daysWithOrders, daysInMonth }) => {
        // Use selectedDay = -1 so it doesn't interfere
        const { getByTestId, unmount } = render(
          React.createElement(CalendarCard, {
            year,
            month,
            selectedDay: -1,
            daysWithOrders,
            onDayPress: () => {},
          })
        );

        const ordersSet = new Set(daysWithOrders);

        // For each day in the month, check accessibility role for tappable days
        for (let day = 1; day <= daysInMonth; day++) {
          const cell = getByTestId(`calendar-day-${day}`);
          if (ordersSet.has(day)) {
            // Day with orders should have button role (TouchableOpacity)
            expect(cell.props.accessibilityRole).toBe('button');
          } else {
            // Day without orders should NOT be a button
            expect(cell.props.accessibilityRole).not.toBe('button');
          }
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  }, 60_000);

  it('selected day is rendered as tappable even when it has orders', () => {
    fc.assert(
      fc.property(calendarWithOrdersArb, ({ year, month, daysWithOrders, daysInMonth }) => {
        // Pick a selectedDay from daysWithOrders if available, otherwise skip
        if (daysWithOrders.length === 0) return;

        const selectedDay = daysWithOrders[0]!;

        const { getByTestId, unmount } = render(
          React.createElement(CalendarCard, {
            year,
            month,
            selectedDay,
            daysWithOrders,
            onDayPress: () => {},
          })
        );

        // Selected day should be tappable (button role)
        const selectedCell = getByTestId(`calendar-day-${selectedDay}`);
        expect(selectedCell.props.accessibilityRole).toBe('button');
        expect(selectedCell.props.accessibilityLabel).toContain('selecionado');

        // Other days with orders should still be tappable buttons
        const ordersSet = new Set(daysWithOrders);
        for (let day = 1; day <= daysInMonth; day++) {
          if (day === selectedDay) continue;
          const cell = getByTestId(`calendar-day-${day}`);
          if (ordersSet.has(day)) {
            expect(cell.props.accessibilityRole).toBe('button');
          } else {
            expect(cell.props.accessibilityRole).not.toBe('button');
          }
        }

        unmount();
      }),
      { numRuns: 100 }
    );
  }, 60_000);
});
