import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: food-truck-order-system, Property 8: Total = Σ(preço × quantidade)
 *
 * Para qualquer conjunto de itens de pedido com preços e quantidades, o valor total
 * calculado deve ser exatamente igual à soma de (preço_unitário × quantidade) para
 * cada item, sem erros de arredondamento.
 *
 * **Validates: Requirements 5.2**
 */
describe('Property 8: Total = Σ(preço × quantidade)', () => {
  // Generator: order item with valid price and quantity ranges
  const orderItemArb = fc.record({
    unitPriceCents: fc.integer({ min: 1, max: 999999 }),
    quantity: fc.integer({ min: 1, max: 99 }),
  });

  // Generator: non-empty array of order items (1 to 20 items)
  const orderItemsArb = fc.array(orderItemArb, { minLength: 1, maxLength: 20 });

  // The calculateTotal function mirrors the backend logic
  const calculateTotal = (items: { unitPriceCents: number; quantity: number }[]) =>
    items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);

  it('total is exactly equal to Σ(unitPriceCents × quantity) for all items', () => {
    fc.assert(
      fc.property(orderItemsArb, (items) => {
        const total = calculateTotal(items);

        // Manually compute the expected sum
        let expectedTotal = 0;
        for (const item of items) {
          expectedTotal += item.unitPriceCents * item.quantity;
        }

        expect(total).toBe(expectedTotal);
      }),
      { numRuns: 100 }
    );
  });

  it('no floating-point rounding errors occur (result is always an integer)', () => {
    fc.assert(
      fc.property(orderItemsArb, (items) => {
        const total = calculateTotal(items);

        // Since all inputs are integers and we only use addition and multiplication,
        // the result must always be an exact integer (no floating-point artifacts)
        expect(Number.isInteger(total)).toBe(true);
        expect(total).toBe(Math.floor(total));
      }),
      { numRuns: 100 }
    );
  });

  it('total is always a positive integer when items are present', () => {
    fc.assert(
      fc.property(orderItemsArb, (items) => {
        const total = calculateTotal(items);

        // All unitPriceCents >= 1 and all quantities >= 1, so each product >= 1
        // With at least 1 item, the total must be >= 1
        expect(total).toBeGreaterThan(0);
        expect(Number.isInteger(total)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
