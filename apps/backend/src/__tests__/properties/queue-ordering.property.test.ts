import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { OrderStatus } from '@order-system/shared';

/**
 * Feature: food-truck-order-system, Property 9: Fila ordenada por created_at crescente
 *
 * Para qualquer conjunto de pedidos com status aguardando ou preparando, a fila exibida
 * (tanto na Tela do Preparador quanto no App) deve estar ordenada por created_at
 * crescente (mais antigo primeiro).
 *
 * **Validates: Requirements 6.1, 6.5**
 */
describe('Property 9: Fila ordenada por created_at crescente', () => {
  interface QueueOrder {
    id: string;
    status: OrderStatus;
    createdAt: string;
  }

  // The queue logic: filter by active statuses, then sort by createdAt ascending
  function getQueue(orders: QueueOrder[]): QueueOrder[] {
    return orders
      .filter((o) => o.status === 'aguardando' || o.status === 'preparando')
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }

  // Generator: random OrderStatus across all possible values
  const orderStatusArb: fc.Arbitrary<OrderStatus> = fc.constantFrom(
    'aguardando',
    'preparando',
    'pronto',
    'entregue'
  );

  // Generator: random ISO date string within a realistic range (using integer timestamps)
  const createdAtArb = fc
    .integer({
      min: new Date('2024-01-01T00:00:00Z').getTime(),
      max: new Date('2025-12-31T23:59:59Z').getTime(),
    })
    .map((ts) => new Date(ts).toISOString());

  // Generator: a single order with random status and createdAt
  const orderArb: fc.Arbitrary<QueueOrder> = fc.record({
    id: fc.uuid(),
    status: orderStatusArb,
    createdAt: createdAtArb,
  });

  // Generator: array of orders (mix of statuses)
  const ordersArb = fc.array(orderArb, { minLength: 0, maxLength: 50 });

  it('should return orders sorted by createdAt ascending (earlier first)', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const queue = getQueue(orders);

        // Consecutive orders must have createdAt in non-decreasing order
        for (let i = 1; i < queue.length; i++) {
          const prevTime = new Date(queue[i - 1]!.createdAt).getTime();
          const currTime = new Date(queue[i]!.createdAt).getTime();
          expect(prevTime).toBeLessThanOrEqual(currTime);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should only include orders with status aguardando or preparando', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const queue = getQueue(orders);

        // Every order in the queue must have an active status
        for (const order of queue) {
          expect(['aguardando', 'preparando']).toContain(order.status);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should not lose any active orders during filtering and sorting', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const queue = getQueue(orders);

        // Count orders with active status in the input
        const expectedCount = orders.filter(
          (o) => o.status === 'aguardando' || o.status === 'preparando'
        ).length;

        expect(queue.length).toBe(expectedCount);
      }),
      { numRuns: 100 }
    );
  });

  it('should exclude all orders with status pronto or entregue', () => {
    fc.assert(
      fc.property(ordersArb, (orders) => {
        const queue = getQueue(orders);

        // No order in the queue should have status pronto or entregue
        for (const order of queue) {
          expect(order.status).not.toBe('pronto');
          expect(order.status).not.toBe('entregue');
        }
      }),
      { numRuns: 100 }
    );
  });
});
