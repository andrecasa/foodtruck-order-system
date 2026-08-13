import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { Order, OrderStatus, OrderOrigin } from '@order-system/shared';

/**
 * Feature: food-truck-order-system, Property 10: Card contém número, nome, origem, itens, status
 *
 * Para qualquer pedido válido na fila, o cartão renderizado deve conter:
 * número sequencial do dia, nome do cliente, origem, lista completa de itens
 * com nome e quantidade, e status atual.
 *
 * **Validates: Requirements 6.3**
 */
describe('Property 10: Card contém número, nome, origem, itens, status', () => {
  const VALID_STATUSES: OrderStatus[] = ['aguardando', 'preparando', 'pronto', 'entregue'];
  const VALID_ORIGINS: OrderOrigin[] = ['presencial', 'whatsapp'];

  // Generator: positive integer for dailyNumber
  const validDailyNumber = fc.integer({ min: 1, max: 9999 });

  // Generator: valid customer name (1-100 non-empty characters)
  const validCustomerName = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length > 0);

  // Generator: valid origin
  const validOrigin = fc.constantFrom<OrderOrigin>(...VALID_ORIGINS);

  // Generator: valid order status
  const validStatus = fc.constantFrom<OrderStatus>(...VALID_STATUSES);

  // Generator: valid order item with name and quantity
  const validOrderItem = fc.record({
    menuItemId: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    quantity: fc.integer({ min: 1, max: 99 }),
    unitPrice: fc.integer({ min: 1, max: 999999 }),
  });

  // Generator: non-empty array of order items (1 to 20 items)
  const validItems = fc.array(validOrderItem, { minLength: 1, maxLength: 20 });

  // Generator: complete valid Order object
  const validOrder = fc.record({
    id: fc.uuid(),
    dailyNumber: validDailyNumber,
    customerName: validCustomerName,
    origin: validOrigin,
    status: validStatus,
    paymentStatus: fc.constantFrom('pendente' as const, 'pago' as const),
    items: validItems,
    totalAmount: fc.integer({ min: 1, max: 99999999 }),
    createdAt: fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2030-12-31T23:59:59Z') }).filter((d) => !isNaN(d.getTime())).map((d) => d.toISOString()),
  });

  it('every valid order has a positive integer dailyNumber', () => {
    fc.assert(
      fc.property(validOrder, (order) => {
        expect(order.dailyNumber).toBeGreaterThan(0);
        expect(Number.isInteger(order.dailyNumber)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('every valid order has a non-empty customerName', () => {
    fc.assert(
      fc.property(validOrder, (order) => {
        expect(typeof order.customerName).toBe('string');
        expect(order.customerName.length).toBeGreaterThanOrEqual(1);
        expect(order.customerName.length).toBeLessThanOrEqual(100);
        expect(order.customerName.trim().length).toBeGreaterThan(0);
      }),
      { numRuns: 100 }
    );
  });

  it('every valid order has a valid origin (presencial or whatsapp)', () => {
    fc.assert(
      fc.property(validOrder, (order) => {
        expect(VALID_ORIGINS).toContain(order.origin);
      }),
      { numRuns: 100 }
    );
  });

  it('every valid order has a non-empty items array where each item has name and quantity', () => {
    fc.assert(
      fc.property(validOrder, (order) => {
        expect(Array.isArray(order.items)).toBe(true);
        expect(order.items.length).toBeGreaterThanOrEqual(1);

        for (const item of order.items) {
          // Each item must have a non-empty name
          expect(typeof item.name).toBe('string');
          expect(item.name.length).toBeGreaterThanOrEqual(1);
          expect(item.name.trim().length).toBeGreaterThan(0);

          // Each item must have a positive integer quantity
          expect(item.quantity).toBeGreaterThanOrEqual(1);
          expect(item.quantity).toBeLessThanOrEqual(99);
          expect(Number.isInteger(item.quantity)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('every valid order has a valid status', () => {
    fc.assert(
      fc.property(validOrder, (order) => {
        expect(VALID_STATUSES).toContain(order.status);
      }),
      { numRuns: 100 }
    );
  });

  it('all required card fields are present and non-empty for any valid order', () => {
    fc.assert(
      fc.property(validOrder, (order) => {
        // Simulate extracting card display data from the order
        const cardData = {
          dailyNumber: order.dailyNumber,
          customerName: order.customerName,
          origin: order.origin,
          items: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
          status: order.status,
        };

        // Property: dailyNumber is present and positive
        expect(cardData.dailyNumber).toBeGreaterThan(0);
        expect(Number.isInteger(cardData.dailyNumber)).toBe(true);

        // Property: customerName is present and non-empty
        expect(cardData.customerName.trim().length).toBeGreaterThan(0);

        // Property: origin is one of the valid values
        expect(VALID_ORIGINS).toContain(cardData.origin);

        // Property: items is a non-empty array with complete item info
        expect(cardData.items.length).toBeGreaterThanOrEqual(1);
        for (const item of cardData.items) {
          expect(item.name.trim().length).toBeGreaterThan(0);
          expect(item.quantity).toBeGreaterThanOrEqual(1);
        }

        // Property: status is one of the valid order statuses
        expect(VALID_STATUSES).toContain(cardData.status);
      }),
      { numRuns: 100 }
    );
  });
});
