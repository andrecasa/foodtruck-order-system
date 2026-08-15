import * as fc from 'fast-check';
import { getDefaultSelectedDay } from '../../utils/calendar';
import type { DayBreakdown } from '@order-system/shared';

/**
 * Feature: summary-intermediate-screen, Property 5: Default day selection algorithm
 *
 * `getDefaultSelectedDay` SHALL return today's day number when viewing the current
 * month/year, or day 1 when viewing a different month.
 *
 * **Validates: Requirements 5.4, 3.6**
 */
describe('Property 5: Default day selection algorithm', () => {
  const dayBreakdownArb: fc.Arbitrary<DayBreakdown> = fc.record({
    day: fc.integer({ min: 1, max: 31 }),
    orderCount: fc.integer({ min: 1, max: 100 }),
    revenue: fc.integer({ min: 100, max: 99999 }),
    paidOrders: fc.integer({ min: 0, max: 100 }),
  }).map((rec) => ({
    ...rec,
    paidOrders: Math.min(rec.paidOrders, rec.orderCount),
  }));

  const nonEmptyDaysArb = fc.array(dayBreakdownArb, { minLength: 1, maxLength: 31 });
  const emptyDaysArb = fc.constant([] as DayBreakdown[]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  it('returns today when viewing the current month/year', () => {
    fc.assert(
      fc.property(
        fc.oneof(emptyDaysArb, nonEmptyDaysArb),
        (days) => {
          const result = getDefaultSelectedDay(days, currentYear, currentMonth);
          expect(result).toBe(currentDay);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns 1 when viewing a different month', () => {
    // Use a month that is definitely not the current month
    const otherMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const otherYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    fc.assert(
      fc.property(
        fc.oneof(emptyDaysArb, nonEmptyDaysArb),
        (days) => {
          const result = getDefaultSelectedDay(days, otherYear, otherMonth);
          expect(result).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns today when no year/month is provided (legacy behavior)', () => {
    fc.assert(
      fc.property(
        fc.oneof(emptyDaysArb, nonEmptyDaysArb),
        (days) => {
          const result = getDefaultSelectedDay(days);
          expect(result).toBe(currentDay);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('result is always a positive integer', () => {
    fc.assert(
      fc.property(
        fc.oneof(emptyDaysArb, nonEmptyDaysArb),
        fc.integer({ min: 2020, max: 2030 }),
        fc.integer({ min: 1, max: 12 }),
        (days, year, month) => {
          const result = getDefaultSelectedDay(days, year, month);
          expect(result).toBeGreaterThanOrEqual(1);
          expect(result).toBeLessThanOrEqual(31);
          expect(Number.isInteger(result)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
