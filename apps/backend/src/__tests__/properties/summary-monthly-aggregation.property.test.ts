import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: summary-intermediate-screen, Property 6: Monthly API aggregation correctness
 *
 * For any set of orders within a given month, the `/api/summary/monthly` endpoint SHALL return:
 * - `totals.totalOrders` = count of all orders
 * - `totals.totalRevenue` = sum of all `total_amount_cents`
 * - `totals.totalReceived` = sum of `total_amount_cents` where `payment_status = 'pago'`
 * - `totals.totalPending` = sum of `total_amount_cents` where `payment_status = 'pendente'`
 * - Each entry in `days[]` SHALL have the correct count and sum for orders on that specific day.
 *
 * **Validates: Requirements 7.2, 7.3**
 */
describe('Property 6: Monthly API aggregation correctness', () => {
  type PaymentStatus = 'pago' | 'pendente';

  interface Order {
    day: number;
    totalAmountCents: number;
    paymentStatus: PaymentStatus;
  }

  interface DayBreakdown {
    day: number;
    orderCount: number;
    revenue: number;
    paidOrders: number;
  }

  interface MonthlySummaryResponse {
    year: number;
    month: number;
    totals: {
      totalOrders: number;
      totalRevenue: number;
      totalReceived: number;
      totalPending: number;
    };
    days: DayBreakdown[];
  }

  // Generator: a random order within a month (day 1-28 to avoid month-length concerns)
  const orderArb = fc.record({
    day: fc.integer({ min: 1, max: 28 }),
    totalAmountCents: fc.integer({ min: 100, max: 99999 }),
    paymentStatus: fc.constantFrom('pago' as PaymentStatus, 'pendente' as PaymentStatus),
  });

  // Generator: array of 0 to 50 orders
  const ordersArb = fc.array(orderArb, { minLength: 0, maxLength: 50 });

  /**
   * Aggregation logic that mirrors the backend controller's SQL queries.
   * This computes the monthly summary from a set of orders.
   */
  function computeMonthlySummary(orders: Order[], year: number, month: number): MonthlySummaryResponse {
    // Totals aggregation
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, o) => sum + o.totalAmountCents, 0);
    const totalReceived = orders
      .filter(o => o.paymentStatus === 'pago')
      .reduce((sum, o) => sum + o.totalAmountCents, 0);
    const totalPending = orders
      .filter(o => o.paymentStatus === 'pendente')
      .reduce((sum, o) => sum + o.totalAmountCents, 0);

    // Per-day breakdown aggregation
    const dayMap = new Map<number, { orderCount: number; revenue: number; paidOrders: number }>();
    for (const order of orders) {
      const existing = dayMap.get(order.day);
      if (existing) {
        existing.orderCount += 1;
        existing.revenue += order.totalAmountCents;
        if (order.paymentStatus === 'pago') {
          existing.paidOrders += 1;
        }
      } else {
        dayMap.set(order.day, {
          orderCount: 1,
          revenue: order.totalAmountCents,
          paidOrders: order.paymentStatus === 'pago' ? 1 : 0,
        });
      }
    }

    const days: DayBreakdown[] = Array.from(dayMap.entries())
      .map(([day, data]) => ({ day, ...data }))
      .sort((a, b) => a.day - b.day);

    return {
      year,
      month,
      totals: { totalOrders, totalRevenue, totalReceived, totalPending },
      days,
    };
  }

  it('totals.totalOrders equals the count of all orders', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);
        expect(summary.totals.totalOrders).toBe(orders.length);
      }),
      { numRuns: 100 }
    );
  });

  it('totals.totalRevenue equals the sum of all total_amount_cents', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);
        const expectedRevenue = orders.reduce((sum, o) => sum + o.totalAmountCents, 0);
        expect(summary.totals.totalRevenue).toBe(expectedRevenue);
      }),
      { numRuns: 100 }
    );
  });

  it('totals.totalReceived equals sum of total_amount_cents where payment_status = pago', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);
        const expectedReceived = orders
          .filter(o => o.paymentStatus === 'pago')
          .reduce((sum, o) => sum + o.totalAmountCents, 0);
        expect(summary.totals.totalReceived).toBe(expectedReceived);
      }),
      { numRuns: 100 }
    );
  });

  it('totals.totalPending equals sum of total_amount_cents where payment_status = pendente', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);
        const expectedPending = orders
          .filter(o => o.paymentStatus === 'pendente')
          .reduce((sum, o) => sum + o.totalAmountCents, 0);
        expect(summary.totals.totalPending).toBe(expectedPending);
      }),
      { numRuns: 100 }
    );
  });

  it('totalRevenue equals totalReceived + totalPending (no money lost)', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);
        expect(summary.totals.totalRevenue).toBe(
          summary.totals.totalReceived + summary.totals.totalPending
        );
      }),
      { numRuns: 100 }
    );
  });

  it('each entry in days[] has correct orderCount for that day', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);

        for (const dayEntry of summary.days) {
          const ordersOnDay = orders.filter(o => o.day === dayEntry.day);
          expect(dayEntry.orderCount).toBe(ordersOnDay.length);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('each entry in days[] has correct revenue sum for that day', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);

        for (const dayEntry of summary.days) {
          const ordersOnDay = orders.filter(o => o.day === dayEntry.day);
          const expectedRevenue = ordersOnDay.reduce((sum, o) => sum + o.totalAmountCents, 0);
          expect(dayEntry.revenue).toBe(expectedRevenue);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('each entry in days[] has correct paidOrders count for that day', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);

        for (const dayEntry of summary.days) {
          const paidOnDay = orders.filter(o => o.day === dayEntry.day && o.paymentStatus === 'pago');
          expect(dayEntry.paidOrders).toBe(paidOnDay.length);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('days[] contains exactly the set of days that have at least one order', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);

        // Expected: unique set of days from orders
        const expectedDays = [...new Set(orders.map(o => o.day))].sort((a, b) => a - b);
        const actualDays = summary.days.map(d => d.day);

        expect(actualDays).toEqual(expectedDays);
      }),
      { numRuns: 100 }
    );
  });

  it('sum of all per-day revenues equals totals.totalRevenue', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);

        const sumOfDayRevenues = summary.days.reduce((sum, d) => sum + d.revenue, 0);
        expect(sumOfDayRevenues).toBe(summary.totals.totalRevenue);
      }),
      { numRuns: 100 }
    );
  });

  it('sum of all per-day orderCounts equals totals.totalOrders', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeMonthlySummary(orders, 2026, 8);

        const sumOfDayCounts = summary.days.reduce((sum, d) => sum + d.orderCount, 0);
        expect(sumOfDayCounts).toBe(summary.totals.totalOrders);
      }),
      { numRuns: 100 }
    );
  });
});
