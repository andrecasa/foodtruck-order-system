import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { toZonedTime, format } from 'date-fns-tz';

/**
 * Feature: food-truck-order-system, Property 15: Fronteira de data por fuso horário
 *
 * Para qualquer conjunto de pedidos com timestamps próximos à meia-noite
 * (fuso America/Sao_Paulo), o resumo do dia deve incluir corretamente apenas
 * pedidos cujo created_at convertido para America/Sao_Paulo caia dentro do
 * dia consultado (00:00–23:59).
 *
 * **Validates: Requirements 9.1**
 */
describe('Property 15: Fronteira de data por fuso horário', () => {
  const SAO_PAULO_TZ = 'America/Sao_Paulo';

  /**
   * Helper: converts a UTC Date to the São Paulo date string (yyyy-MM-dd)
   * using the same logic as the summary controller.
   */
  function getOrderDate(utcDate: Date): string {
    const zonedDate = toZonedTime(utcDate, SAO_PAULO_TZ);
    return format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
  }

  /**
   * Generator: a UTC timestamp near midnight in São Paulo timezone.
   * Brazil standard time is UTC-3 (DST abolished in 2019).
   * Midnight in São Paulo = 03:00 UTC.
   * We generate timestamps within ±2 hours of midnight boundary (01:00–05:00 UTC)
   * on random days within 2020-2030 (post-DST abolition era).
   */
  const utcNearMidnightSaoPauloArb = fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }), // Keep to 28 to avoid invalid dates
      // UTC hour near midnight SP: midnight SP = 03:00 UTC
      // Generate between 01:00 and 04:59 UTC to cover both sides of the boundary
      hour: fc.integer({ min: 1, max: 4 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map(({ year, month, day, hour, minute, second }) => {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    });

  /**
   * Generator: any UTC timestamp across a wide range (not just near boundary).
   */
  const anyUtcTimestampArb = fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
    })
    .map(({ year, month, day, hour, minute, second }) => {
      return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    });

  it('a UTC timestamp before 03:00 on day X maps to day X-1 in São Paulo', () => {
    fc.assert(
      fc.property(utcNearMidnightSaoPauloArb, (utcDate) => {
        const utcHour = utcDate.getUTCHours();
        const orderDate = getOrderDate(utcDate);

        // Brazil is UTC-3. Before 03:00 UTC means it's still the previous day in SP.
        // At exactly 03:00 UTC it becomes 00:00 SP (new day).
        if (utcHour < 3) {
          // Before 03:00 UTC → still previous day in São Paulo
          const expectedDay = new Date(utcDate);
          expectedDay.setUTCDate(expectedDay.getUTCDate() - 1);
          const expectedDate = `${expectedDay.getUTCFullYear()}-${String(expectedDay.getUTCMonth() + 1).padStart(2, '0')}-${String(expectedDay.getUTCDate()).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        } else {
          // 03:00 UTC or later → same day in São Paulo
          const expectedDate = `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}-${String(utcDate.getUTCDate()).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        }
      }),
      { numRuns: 200 }
    );
  });

  it('orders at exactly 03:00 UTC belong to a new day in São Paulo', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 2, max: 28 }), // Start from 2 to allow previous day reference
        }),
        ({ year, month, day }) => {
          // Exactly 03:00 UTC = 00:00 São Paulo → new day in SP
          const utcDate = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
          const orderDate = getOrderDate(utcDate);
          const expectedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('orders at 02:59 UTC belong to the previous day in São Paulo', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 2, max: 28 }),
        }),
        ({ year, month, day }) => {
          // 02:59 UTC = 23:59 São Paulo → still the previous day in SP
          const utcDate = new Date(Date.UTC(year, month - 1, day, 2, 59, 59));
          const orderDate = getOrderDate(utcDate);
          const prevDay = new Date(Date.UTC(year, month - 1, day - 1));
          const expectedDate = `${prevDay.getUTCFullYear()}-${String(prevDay.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDay.getUTCDate()).padStart(2, '0')}`;
          expect(orderDate).toBe(expectedDate);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('two UTC timestamps on the same São Paulo date produce the same order_date', () => {
    fc.assert(
      fc.property(
        fc.record({
          year: fc.integer({ min: 2020, max: 2030 }),
          month: fc.integer({ min: 1, max: 12 }),
          day: fc.integer({ min: 1, max: 28 }),
          // Two different SP-local hours within the same day (0-23)
          spHour1: fc.integer({ min: 0, max: 23 }),
          spHour2: fc.integer({ min: 0, max: 23 }),
          minute1: fc.integer({ min: 0, max: 59 }),
          minute2: fc.integer({ min: 0, max: 59 }),
        }),
        ({ year, month, day, spHour1, spHour2, minute1, minute2 }) => {
          // Convert SP local time to UTC by adding 3 hours (UTC-3)
          const utc1 = new Date(Date.UTC(year, month - 1, day, spHour1 + 3, minute1, 0));
          const utc2 = new Date(Date.UTC(year, month - 1, day, spHour2 + 3, minute2, 0));

          const date1 = getOrderDate(utc1);
          const date2 = getOrderDate(utc2);

          // Both should produce the same São Paulo date
          expect(date1).toBe(date2);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the order_date format is always yyyy-MM-dd for any UTC timestamp', () => {
    fc.assert(
      fc.property(anyUtcTimestampArb, (utcDate) => {
        const orderDate = getOrderDate(utcDate);

        // Must match yyyy-MM-dd format
        expect(orderDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // Must be a valid date when parsed
        const [yearStr, monthStr, dayStr] = orderDate.split('-');
        const y = parseInt(yearStr, 10);
        const m = parseInt(monthStr, 10);
        const d = parseInt(dayStr, 10);

        expect(y).toBeGreaterThanOrEqual(2020);
        expect(y).toBeLessThanOrEqual(2030);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(12);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(31);
      }),
      { numRuns: 100 }
    );
  });
});
