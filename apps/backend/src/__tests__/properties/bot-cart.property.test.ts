import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock external dependencies to allow importing pure functions from the service
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { channel: vi.fn() },
}));

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../../bot/evolution-api.client.js', () => ({
  sendTextMessage: vi.fn(),
}));

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn(),
  format: vi.fn(),
}));

import { addToCart, calculateCartTotal, type CartItem } from '../../bot/whatsapp.service.js';

/**
 * Feature: food-truck-order-system, Property 17: Acumulação correta do carrinho do bot
 *
 * Para qualquer sequência de seleções válidas de itens durante o fluxo do Bot,
 * o carrinho acumulado deve conter cada item com a quantidade correta, e o total
 * exibido no resumo deve ser igual à soma de (preço × quantidade) de todos os itens.
 *
 * **Validates: Requirements 10.3**
 */
describe('Property 17: Acumulação correta do carrinho do bot', () => {
  // Fixed pool size for generation simplicity
  const POOL_SIZE = 5;

  // Generator: a pool of POOL_SIZE distinct menu items
  const menuPoolArb = fc
    .array(
      fc.record({
        price_cents: fc.integer({ min: 1, max: 999999 }),
        name: fc.string({ minLength: 1, maxLength: 30 }),
      }),
      { minLength: POOL_SIZE, maxLength: POOL_SIZE }
    )
    .map((items) =>
      items.map((item, idx) => ({
        id: `menu-item-${idx}`,
        name: `Item ${idx} ${item.name}`,
        price_cents: item.price_cents,
        category_name: 'Categoria',
        category_sort_order: 1,
      }))
    );

  // Generator: a sequence of selections (index into pool + quantity)
  const selectionsArb = fc.array(
    fc.record({
      itemIndex: fc.integer({ min: 0, max: POOL_SIZE - 1 }),
      quantity: fc.integer({ min: 1, max: 99 }),
    }),
    { minLength: 1, maxLength: 20 }
  );

  // Combined generator: pool + selections
  const cartScenarioArb = fc.tuple(menuPoolArb, selectionsArb);

  it('each item quantity equals the sum of all additions for that item', () => {
    fc.assert(
      fc.property(cartScenarioArb, ([pool, selections]) => {
        let cart: CartItem[] = [];

        // Apply all selections
        for (const sel of selections) {
          const menuItem = pool[sel.itemIndex]!;
          cart = addToCart(cart, menuItem, sel.quantity);
        }

        // Compute expected quantities per item
        const expectedQuantities = new Map<string, number>();
        for (const sel of selections) {
          const menuItem = pool[sel.itemIndex]!;
          const current = expectedQuantities.get(menuItem.id) || 0;
          expectedQuantities.set(menuItem.id, current + sel.quantity);
        }

        // Verify cart has correct quantities
        for (const [itemId, expectedQty] of expectedQuantities) {
          const cartItem = cart.find((c) => c.menuItemId === itemId);
          expect(cartItem).toBeDefined();
          expect(cartItem!.quantity).toBe(expectedQty);
        }

        // Verify no extra items in cart
        expect(cart.length).toBe(expectedQuantities.size);
      }),
      { numRuns: 100 }
    );
  });

  it('calculateCartTotal returns exactly Σ(unitPriceCents × quantity) for all items', () => {
    fc.assert(
      fc.property(cartScenarioArb, ([pool, selections]) => {
        let cart: CartItem[] = [];

        // Apply all selections
        for (const sel of selections) {
          const menuItem = pool[sel.itemIndex]!;
          cart = addToCart(cart, menuItem, sel.quantity);
        }

        // Calculate total using the service function
        const total = calculateCartTotal(cart);

        // Manually compute the expected total
        let expectedTotal = 0;
        for (const item of cart) {
          expectedTotal += item.unitPriceCents * item.quantity;
        }

        expect(total).toBe(expectedTotal);
      }),
      { numRuns: 100 }
    );
  });
});
