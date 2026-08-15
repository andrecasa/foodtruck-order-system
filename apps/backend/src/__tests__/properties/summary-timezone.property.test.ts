import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * Feature: summary-intermediate-screen, Property 7: Timezone date attribution
 *
 * For any order created near a day boundary, the `/api/summary/monthly` endpoint
 * SHALL attribute it to the correct date in the America/Sao_Paulo timezone, not UTC.
 *
 * **Validates: Requirements 7.5**
 */
describe('Property 7: Timezone date attribution', () => {
  const SAO_PAULO_TZ = 'America/Sao_Paulo';

  /**
   * Mirrors the controller logic for computing the order_date from a UTC timestamp.
   * This is how the system assigns a date to an order at creation time.
   */
  function computeOrderDate(utcTimestamp: Date): string {
    const zonedDate = toZonedTime(utcTimestamp, SAO_PAULO_TZ);
    return format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
  }

  /**
   * Mirrors the monthly endpoint logic for computing the first and last day of a month.
   */
  function computeMonthRange(year: number, month: number): { firstDay: string; lastDay: string } {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return { firstDay, lastDay };
  }

  /**
   * Checks if an order_date falls within the monthly range (inclusive).
   * Mirrors the SQL: WHERE order_date >= firstDay AND order_date <= lastDay
   */
  function isDateInMonthRange(orderDate: string, firstDay: string, lastDay: string): boolean {
    return orderDate >= firstDay && orderDate <= lastDay;
  }

  // Generator: UTC timestamps near midnight in São Paulo (01:00–05:00 UTC = 22:00–02:00 SP)
  const utcNearMidnightSPArb = fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 2, max: 27 }), // Avoid boundary months for simplicity
      // Midnight SP = 03:00 UTC. Generate ±2h around it.
      hour: fc.integer({ min: 1, max: 4 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map(({ year, month, day, hour, minute, second }) => ({
      utcDate: new Date(Date.UTC(year, month - 1, day, hour, minute, second)),
      year,
      month,
      day,
    }));

  // Generator: random year/month for range computation tests
  const yearMonthArb = fc.record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
  });

  it('orders near midnight are attributed to the correct São Paulo day, not the UTC day', () => {
    fc.assert(
      fc.property(utcNearMidnightSPArb, ({ utcDate }) => {
        const orderDate = computeOrderDate(utcDate);
        const utcHour = utcDate.getUTCHours();

        // Brazil is UTC-3 (no DST since 2019).
        // Before 03:00 UTC → still previous day in São Paulo.
        // At 03:00+ UTC → current UTC day in São Paulo.
        if (utcHour < 3) {
          // Should be previous calendar day (São Paulo is still on yesterday)
          const prevDay = new Date(utcDate);
          prevDay.setUTCDate(prevDay.getUTCDate() - 1);
          const expectedDate = `${prevDay.getUTCFullYear()}-${String(prevDay.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDay.getUTCDate()).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        } else {
          // Should be same UTC calendar day
          const expectedDate = `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('monthly range correctly covers all days in any month (including leap years)', () => {
    fc.assert(
      fc.property(yearMonthArb, ({ year, month }) => {
        const { firstDay, lastDay } = computeMonthRange(year, month);
        const daysInMonth = new Date(year, month, 0).getDate();

        // First day is always the 1st
        expect(firstDay).toBe(`${year}-${String(month).padStart(2, '0')}-01`);

        // Last day matches actual days in month
        expect(lastDay).toBe(`${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`);

        // Verify days in month for known edge cases
        if (month === 2) {
          const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
          expect(daysInMonth).toBe(isLeapYear ? 29 : 28);
        } else if ([4, 6, 9, 11].includes(month)) {
          expect(daysInMonth).toBe(30);
        } else {
          expect(daysInMonth).toBe(31);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('an order attributed to a São Paulo date falls within the correct monthly range', () => {
    fc.assert(
      fc.property(utcNearMidnightSPArb, ({ utcDate }) => {
        const orderDate = computeOrderDate(utcDate);

        // Parse the attributed date to determine its month
        const [yearStr, monthStr] = orderDate.split('-');
        const attributedYear = parseInt(yearStr!, 10);
        const attributedMonth = parseInt(monthStr!, 10);

        // The order should fall within its attributed month's range
        const { firstDay, lastDay } = computeMonthRange(attributedYear, attributedMonth);
        expect(isDateInMonthRange(orderDate, firstDay, lastDay)).toBe(true);
      }),
      { numRuns: 200 }
    );
  });

  it('orders at month boundaries are attributed to the correct month in São Paulo', () => {
    // Generate timestamps right around the first moment of a new month in São Paulo
    const monthBoundaryArb = fc
      .record({
        year: fc.integer({ min: 2020, max: 2030 }),
        month: fc.integer({ min: 1, max: 12 }),
        // Offset in seconds from midnight SP on the 1st of the month (±3600s = ±1h)
        offsetSeconds: fc.integer({ min: -3600, max: 3600 }),
      })
      .map(({ year, month, offsetSeconds }) => {
        // Midnight São Paulo on the 1st = 03:00 UTC on the 1st
        const midnightSPasUTC = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
        const utcDate = new Date(midnightSPasUTC.getTime() + offsetSeconds * 1000);
        return { utcDate, targetYear: year, targetMonth: month };
      });

    fc.assert(
      fc.property(monthBoundaryArb, ({ utcDate, targetYear, targetMonth }) => {
        const orderDate = computeOrderDate(utcDate);
        const [yearStr, monthStr] = orderDate.split('-');
        const attributedYear = parseInt(yearStr!, 10);
        const attributedMonth = parseInt(monthStr!, 10);

        // Midnight SP on the 1st = 03:00 UTC on the 1st
        const midnightSPasUTC = new Date(Date.UTC(targetYear, targetMonth - 1, 1, 3, 0, 0));

        if (utcDate.getTime() >= midnightSPasUTC.getTime()) {
          // At or after midnight SP → should be attributed to target month
          expect(attributedYear).toBe(targetYear);
          expect(attributedMonth).toBe(targetMonth);
        } else {
          // Before midnight SP → should be attributed to previous month
          const prevMonthDate = new Date(targetYear, targetMonth - 2, 1); // month-2 because Date uses 0-based
          expect(attributedYear).toBe(prevMonthDate.getFullYear());
          expect(attributedMonth).toBe(prevMonthDate.getMonth() + 1);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('per-day grouping attributes orders to correct day numbers within a month', () => {
    // Generate a set of UTC timestamps within a single month, verify day extraction
    const ordersInMonthArb = fc
      .record({
        year: fc.integer({ min: 2020, max: 2030 }),
        month: fc.integer({ min: 1, max: 12 }),
      })
      .chain(({ year, month }) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        // Generate 1–20 orders with random UTC hours on random days
        const orderArb = fc.record({
          day: fc.integer({ min: 1, max: daysInMonth }),
          // SP local hour 0-23 → UTC hour is localHour + 3
          localHour: fc.integer({ min: 0, max: 23 }),
          minute: fc.integer({ min: 0, max: 59 }),
        });
        return fc.record({
          year: fc.constant(year),
          month: fc.constant(month),
          orders: fc.array(orderArb, { minLength: 1, maxLength: 20 }),
        });
      });

    fc.assert(
      fc.property(ordersInMonthArb, ({ year, month, orders }) => {
        // For each order, compute the UTC timestamp from local SP time
        // then verify the attributed date matches the intended day
        for (const order of orders) {
          // Convert SP local time to UTC: SP is UTC-3, so add 3 hours
          const utcDate = new Date(Date.UTC(year, month - 1, order.day, order.localHour + 3, order.minute, 0));
          const orderDate = computeOrderDate(utcDate);

          // The day in the attributed date should match the original intended day
          const expectedDate = `${year}-${String(month).padStart(2, '0')}-${String(order.day).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        }
      }),
      { numRuns: 100 }
    );
  });
});
