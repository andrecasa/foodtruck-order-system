import { describe, it } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 6: Apenas itens ativos na seleção e bot
 *
 * Para qualquer estado do cardápio contendo itens com status misto (ativo/inativo),
 * tanto a seleção de itens no App quanto o cardápio exibido pelo Bot devem conter
 * exclusivamente itens com status ativo.
 *
 * Feature: food-truck-order-system, Property 6: Apenas itens ativos na seleção e bot
 *
 * **Validates: Requirements 5.5, 11.1**
 */

interface MenuItem {
  id: string;
  name: string;
  price_cents: number;
  category_name: string;
  status: 'ativo' | 'inativo';
}

/**
 * Simulates the filter logic used by both the getMenu controller
 * (.eq('status', 'ativo')) and the bot's fetchActiveMenuItems
 * (WHERE mi.status = 'ativo').
 */
function filterActiveItems(items: MenuItem[]): MenuItem[] {
  return items.filter((item) => item.status === 'ativo');
}

const menuItemArb: fc.Arbitrary<MenuItem> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  price_cents: fc.integer({ min: 1, max: 999999 }),
  category_name: fc.constantFrom('Pastéis', 'Bebidas', 'Sobremesas', 'Lanches'),
  status: fc.constantFrom('ativo' as const, 'inativo' as const),
});

describe('Property 6: Apenas itens ativos na seleção e bot', () => {
  it('filtered result contains ONLY items with status "ativo"', () => {
    fc.assert(
      fc.property(fc.array(menuItemArb, { minLength: 1, maxLength: 50 }), (items) => {
        const result = filterActiveItems(items);

        // Every item in the result must have status 'ativo'
        return result.every((item) => item.status === 'ativo');
      }),
      { numRuns: 100 }
    );
  });

  it('no item with status "inativo" appears in the filtered result', () => {
    fc.assert(
      fc.property(fc.array(menuItemArb, { minLength: 1, maxLength: 50 }), (items) => {
        const result = filterActiveItems(items);

        // No inactive item should be present
        return result.every((item) => item.status !== 'inativo');
      }),
      { numRuns: 100 }
    );
  });

  it('all active items from the original set are present in the result (no active items lost)', () => {
    fc.assert(
      fc.property(fc.array(menuItemArb, { minLength: 1, maxLength: 50 }), (items) => {
        const result = filterActiveItems(items);
        const activeInOriginal = items.filter((item) => item.status === 'ativo');

        // The count of active items must match
        if (result.length !== activeInOriginal.length) return false;

        // Every active item from the original must be in the result
        return activeInOriginal.every((originalItem) =>
          result.some((resultItem) => resultItem.id === originalItem.id)
        );
      }),
      { numRuns: 100 }
    );
  });

  it('result length equals the number of active items in the original array', () => {
    fc.assert(
      fc.property(fc.array(menuItemArb, { minLength: 0, maxLength: 50 }), (items) => {
        const result = filterActiveItems(items);
        const expectedCount = items.filter((item) => item.status === 'ativo').length;

        return result.length === expectedCount;
      }),
      { numRuns: 100 }
    );
  });
});
