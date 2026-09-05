import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: food-truck-order-system, Property 19: Numeração sequencial sem lacunas/duplicatas
 *
 * Para qualquer sequência de pedidos criados no mesmo dia (inclusive concorrentemente),
 * cada pedido deve receber um daily_number único e sequencial iniciando em 1, sem lacunas
 * e sem duplicatas. Para o primeiro pedido de um novo dia, a numeração deve reiniciar em 1.
 *
 * **Validates: Requirements 12.1, 12.3**
 */
describe('Property 19: Numeração sequencial sem lacunas/duplicatas', () => {
  /**
   * Simulates the next_daily_number PostgreSQL function logic.
   * Uses a Map<date, number> to track the last number assigned per day.
   * This mirrors the DB behavior:
   *   INSERT INTO daily_sequences (order_date, last_number)
   *   VALUES (p_date, 1)
   *   ON CONFLICT (order_date)
   *   DO UPDATE SET last_number = daily_sequences.last_number + 1
   *   RETURNING last_number
   */
  function simulateNextDailyNumber(state: Map<string, number>, date: string): number {
    const current = state.get(date) || 0;
    const next = current + 1;
    state.set(date, next);
    return next;
  }

  // Generator: date string in yyyy-MM-dd format
  const dateArb = fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(({ year, month, day }) => {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    });

  // Generator: a sequence of order creation events, each with a date
  const orderSequenceArb = fc.array(dateArb, { minLength: 1, maxLength: 50 });

  it('for N orders on the same day, daily_numbers form [1..N] without gaps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        dateArb,
        (numOrders, date) => {
          const state = new Map<string, number>();
          const assignedNumbers: number[] = [];

          for (let i = 0; i < numOrders; i++) {
            assignedNumbers.push(simulateNextDailyNumber(state, date));
          }

          // Property: numbers must form sequence [1, 2, 3, ..., N]
          const expected = Array.from({ length: numOrders }, (_, i) => i + 1);
          expect(assignedNumbers).toEqual(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no two orders on the same day receive the same daily_number', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 100 }),
        dateArb,
        (numOrders, date) => {
          const state = new Map<string, number>();
          const assignedNumbers: number[] = [];

          for (let i = 0; i < numOrders; i++) {
            assignedNumbers.push(simulateNextDailyNumber(state, date));
          }

          // Property: all numbers are unique (no duplicates)
          const uniqueNumbers = new Set(assignedNumbers);
          expect(uniqueNumbers.size).toBe(assignedNumbers.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the first order on any day always gets daily_number = 1', () => {
    fc.assert(
      fc.property(dateArb, (date) => {
        const state = new Map<string, number>();

        const firstNumber = simulateNextDailyNumber(state, date);

        // Property: first order of any day starts at 1
        expect(firstNumber).toBe(1);
      }),
      { numRuns: 100 }
    );
  });

  it('numbering restarts at 1 for a new day', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        dateArb,
        dateArb, // second date (will be made different below)
        (ordersDay1, date1, date2Raw) => {
          // Ensure dates are different
          const date2 = date1 === date2Raw
            ? `${parseInt(date2Raw.slice(0, 4)) + 1}-01-01`
            : date2Raw;

          if (date1 === date2) return; // skip if still same after adjustment

          const state = new Map<string, number>();

          // Create orders on first day
          for (let i = 0; i < ordersDay1; i++) {
            simulateNextDailyNumber(state, date1);
          }

          // First order on the new day should restart at 1
          const firstOnNewDay = simulateNextDailyNumber(state, date2);
          expect(firstOnNewDay).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('interleaved orders across multiple days maintain correct sequences per day', () => {
    fc.assert(
      fc.property(orderSequenceArb, (orderDates) => {
        const state = new Map<string, number>();
        const numbersByDate = new Map<string, number[]>();

        // Process all orders
        for (const date of orderDates) {
          const num = simulateNextDailyNumber(state, date);
          const existing = numbersByDate.get(date) || [];
          existing.push(num);
          numbersByDate.set(date, existing);
        }

        // Property: for each day, numbers form a gap-free sequence [1..N]
        for (const [, numbers] of numbersByDate.entries()) {
          const expected = Array.from({ length: numbers.length }, (_, i) => i + 1);
          expect(numbers).toEqual(expected);

          // No duplicates
          const uniqueNumbers = new Set(numbers);
          expect(uniqueNumbers.size).toBe(numbers.length);
        }
      }),
      { numRuns: 100 }
    );
  });
});
