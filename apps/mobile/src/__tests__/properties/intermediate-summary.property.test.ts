import * as fc from 'fast-check';
import { formatPrice, computeTotalRevenue } from '../../utils/format';

/**
 * Feature: summary-intermediate-screen, Property 1: Currency formatting preserves monetary value
 *
 * For any non-negative integer representing centavos, formatPrice should produce a string
 * starting with "R$" whose numeric value equals original/100.
 *
 * **Validates: Requirements 1.2, 1.4**
 */
describe('Property 1: Currency formatting preserves monetary value', () => {
  it('formatPrice output starts with "R$" and preserves the monetary value', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99_999_999 }),
        (centavos) => {
          const formatted = formatPrice(centavos);

          // Must start with "R$"
          expect(formatted.startsWith('R$')).toBe(true);

          // Extract numeric value: remove "R$", replace locale separators
          // pt-BR uses "." as thousands separator and "," as decimal separator
          const numericStr = formatted
            .replace('R$', '')
            .trim()
            .replace(/\./g, '')   // remove thousands separators
            .replace(',', '.');   // convert decimal separator to dot

          const parsed = parseFloat(numericStr);
          const expected = centavos / 100;

          expect(parsed).toBeCloseTo(expected, 2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Feature: summary-intermediate-screen, Property 2: Total revenue is the sum of paid and pending
 *
 * For any valid DailySummary with non-negative paidTotal and pendingTotal,
 * computeTotalRevenue returns exactly paidTotal + pendingTotal.
 *
 * **Validates: Requirements 1.2**
 */
describe('Property 2: Total revenue is the sum of paid and pending', () => {
  const dailySummaryArb = fc.record({
    date: fc.integer({ min: 2020, max: 2030 }).chain((year) =>
      fc.integer({ min: 1, max: 12 }).chain((month) =>
        fc.integer({ min: 1, max: 28 }).map((day) =>
          `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        )
      )
    ),
    totalOrders: fc.integer({ min: 0, max: 9999 }),
    paidOrders: fc.integer({ min: 0, max: 9999 }),
    pendingOrders: fc.integer({ min: 0, max: 9999 }),
    paidTotal: fc.integer({ min: 0, max: 99_999_999 }),
    pendingTotal: fc.integer({ min: 0, max: 99_999_999 }),
    byPaymentMethod: fc.record({
      dinheiro: fc.integer({ min: 0, max: 99_999_999 }),
      pix: fc.integer({ min: 0, max: 99_999_999 }),
      'cartão débito': fc.integer({ min: 0, max: 99_999_999 }),
      'cartão crédito': fc.integer({ min: 0, max: 99_999_999 }),
    }),
  });

  it('computeTotalRevenue returns paidTotal + pendingTotal for any valid DailySummary', () => {
    fc.assert(
      fc.property(dailySummaryArb, (summary) => {
        const result = computeTotalRevenue(summary);
        expect(result).toBe(summary.paidTotal + summary.pendingTotal);
      }),
      { numRuns: 100 }
    );
  });

  it('computeTotalRevenue never returns a negative value for non-negative inputs', () => {
    fc.assert(
      fc.property(dailySummaryArb, (summary) => {
        const result = computeTotalRevenue(summary);
        expect(result).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });
});
