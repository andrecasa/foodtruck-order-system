import * as fc from 'fast-check';
import {
  generateCalendarGrid,
  getDaysInMonth,
  getFirstDayOfMonth,
} from '../../utils/calendar';

/**
 * Feature: summary-intermediate-screen, Property 3: Calendar grid generation correctness
 *
 * For any valid year (1970–2100) and month (1–12), the generated calendar grid SHALL:
 * (a) contain only day numbers within [1, daysInMonth] or null for empty cells,
 * (b) place day 1 at the correct weekday column index, and
 * (c) produce between 4 and 6 rows.
 *
 * **Validates: Requirements 6.1, 6.6**
 */
describe('Property 3: Calendar grid generation correctness', () => {
  const yearArb = fc.integer({ min: 1970, max: 2100 });
  const monthArb = fc.integer({ min: 1, max: 12 });

  it('grid has between 4 and 6 rows', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const grid = generateCalendarGrid(year, month);
        expect(grid.length).toBeGreaterThanOrEqual(4);
        expect(grid.length).toBeLessThanOrEqual(6);
      }),
      { numRuns: 100 }
    );
  });

  it('each row has exactly 7 cells', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const grid = generateCalendarGrid(year, month);
        for (const row of grid) {
          expect(row.length).toBe(7);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('all non-null values are in range [1, daysInMonth]', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const grid = generateCalendarGrid(year, month);
        const daysInMonth = getDaysInMonth(year, month);

        for (const row of grid) {
          for (const cell of row) {
            if (cell !== null) {
              expect(cell).toBeGreaterThanOrEqual(1);
              expect(cell).toBeLessThanOrEqual(daysInMonth);
            }
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('day 1 appears at column index equal to getFirstDayOfMonth(year, month)', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const grid = generateCalendarGrid(year, month);
        const expectedCol = getFirstDayOfMonth(year, month);

        // Day 1 should be in the first row at the expected column
        expect(grid[0]![expectedCol]).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('days appear in sequential order with no gaps and no duplicates', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const grid = generateCalendarGrid(year, month);
        const allDays: number[] = [];

        for (const row of grid) {
          for (const cell of row) {
            if (cell !== null) {
              allDays.push(cell);
            }
          }
        }

        // Days must be strictly sequential: 1, 2, 3, ..., N
        for (let i = 0; i < allDays.length; i++) {
          expect(allDays[i]).toBe(i + 1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('total non-null cells equals daysInMonth', () => {
    fc.assert(
      fc.property(yearArb, monthArb, (year, month) => {
        const grid = generateCalendarGrid(year, month);
        const daysInMonth = getDaysInMonth(year, month);

        let nonNullCount = 0;
        for (const row of grid) {
          for (const cell of row) {
            if (cell !== null) {
              nonNullCount++;
            }
          }
        }

        expect(nonNullCount).toBe(daysInMonth);
      }),
      { numRuns: 100 }
    );
  });
});
