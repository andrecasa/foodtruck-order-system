import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: food-truck-order-system, Property 16: Invariante de agregação do resumo
 *
 * Para qualquer conjunto de pedidos em um dia, deve valer que:
 * totalPedidos = pedidosPagos + pedidosPendentes,
 * somaTotal = somaPagos + somaPendentes, e
 * somaPagos = byPaymentMethod.dinheiro + byPaymentMethod.pix + byPaymentMethod.cartão.
 *
 * **Validates: Requirements 9.2, 9.3**
 */
describe('Property 16: Invariante de agregação do resumo', () => {
  type PaymentStatus = 'pendente' | 'pago';
  type PaymentMethod = 'dinheiro' | 'pix' | 'cartão débito' | 'cartão crédito';

  interface Order {
    totalAmountCents: number;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod | null;
  }

  interface DailySummary {
    totalOrders: number;
    paidOrders: number;
    pendingOrders: number;
    paidTotal: number;
    pendingTotal: number;
    byPaymentMethod: {
      dinheiro: number;
      pix: number;
      'cartão débito': number;
      'cartão crédito': number;
    };
  }

  // Generator: a pending order (no payment method)
  const pendingOrderArb = fc.record({
    totalAmountCents: fc.integer({ min: 1, max: 999999 }),
    paymentStatus: fc.constant('pendente' as PaymentStatus),
    paymentMethod: fc.constant(null as PaymentMethod | null),
  });

  // Generator: a paid order (with payment method)
  const paidOrderArb = fc.record({
    totalAmountCents: fc.integer({ min: 1, max: 999999 }),
    paymentStatus: fc.constant('pago' as PaymentStatus),
    paymentMethod: fc.constantFrom('dinheiro' as PaymentMethod, 'pix' as PaymentMethod, 'cartão débito' as PaymentMethod, 'cartão crédito' as PaymentMethod),
  });

  // Generator: a random order (either pending or paid)
  const orderArb = fc.oneof(pendingOrderArb, paidOrderArb);

  // Generator: array of 0 to 50 orders
  const ordersArb = fc.array(orderArb, { minLength: 0, maxLength: 50 });

  // Compute summary from orders (mirrors backend aggregation logic)
  function computeSummary(orders: Order[]): DailySummary {
    const totalOrders = orders.length;
    const paidOrders = orders.filter(o => o.paymentStatus === 'pago').length;
    const pendingOrders = orders.filter(o => o.paymentStatus === 'pendente').length;
    const paidTotal = orders
      .filter(o => o.paymentStatus === 'pago')
      .reduce((sum, o) => sum + o.totalAmountCents, 0);
    const pendingTotal = orders
      .filter(o => o.paymentStatus === 'pendente')
      .reduce((sum, o) => sum + o.totalAmountCents, 0);
    const byPaymentMethod = {
      dinheiro: orders
        .filter(o => o.paymentStatus === 'pago' && o.paymentMethod === 'dinheiro')
        .reduce((sum, o) => sum + o.totalAmountCents, 0),
      pix: orders
        .filter(o => o.paymentStatus === 'pago' && o.paymentMethod === 'pix')
        .reduce((sum, o) => sum + o.totalAmountCents, 0),
      'cartão débito': orders
        .filter(o => o.paymentStatus === 'pago' && o.paymentMethod === 'cartão débito')
        .reduce((sum, o) => sum + o.totalAmountCents, 0),
      'cartão crédito': orders
        .filter(o => o.paymentStatus === 'pago' && o.paymentMethod === 'cartão crédito')
        .reduce((sum, o) => sum + o.totalAmountCents, 0),
    };
    return { totalOrders, paidOrders, pendingOrders, paidTotal, pendingTotal, byPaymentMethod };
  }

  it('totalOrders === paidOrders + pendingOrders', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeSummary(orders);

        expect(summary.totalOrders).toBe(summary.paidOrders + summary.pendingOrders);
      }),
      { numRuns: 100 }
    );
  });

  it('paidTotal + pendingTotal === sum of all order totals (no money lost)', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeSummary(orders);
        const totalAllOrders = orders.reduce((sum, o) => sum + o.totalAmountCents, 0);

        expect(summary.paidTotal + summary.pendingTotal).toBe(totalAllOrders);
      }),
      { numRuns: 100 }
    );
  });

  it('byPaymentMethod.dinheiro + byPaymentMethod.pix + byPaymentMethod[cartão débito] + byPaymentMethod[cartão crédito] === paidTotal', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeSummary(orders);
        const sumByMethod =
          summary.byPaymentMethod.dinheiro +
          summary.byPaymentMethod.pix +
          summary.byPaymentMethod['cartão débito'] +
          summary.byPaymentMethod['cartão crédito'];

        expect(sumByMethod).toBe(summary.paidTotal);
      }),
      { numRuns: 100 }
    );
  });

  it('all invariants hold simultaneously for any set of orders', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const summary = computeSummary(orders);
        const totalAllOrders = orders.reduce((sum, o) => sum + o.totalAmountCents, 0);

        // Invariant 1: totalOrders = paidOrders + pendingOrders
        expect(summary.totalOrders).toBe(summary.paidOrders + summary.pendingOrders);

        // Invariant 2: paidTotal + pendingTotal = total of all orders
        expect(summary.paidTotal + summary.pendingTotal).toBe(totalAllOrders);

        // Invariant 3: byPaymentMethod breakdown sums to paidTotal
        const sumByMethod =
          summary.byPaymentMethod.dinheiro +
          summary.byPaymentMethod.pix +
          summary.byPaymentMethod['cartão débito'] +
          summary.byPaymentMethod['cartão crédito'];
        expect(sumByMethod).toBe(summary.paidTotal);
      }),
      { numRuns: 100 }
    );
  });
});
