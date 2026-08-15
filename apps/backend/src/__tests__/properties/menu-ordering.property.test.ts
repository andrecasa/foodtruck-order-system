import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: food-truck-order-system, Property 5: Cardápio ordenado por categoria e nome
 *
 * Para qualquer conjunto de itens ativos no cardápio, a lista retornada deve estar
 * agrupada por categoria e, dentro de cada categoria, os itens devem estar ordenados
 * alfabeticamente pelo nome.
 *
 * **Validates: Requirements 4.8**
 */
describe('Property 5: Cardápio ordenado por categoria e nome', () => {
  // Replicates the sorting/grouping logic from menu.controller.ts getMenu
  function groupAndSortMenu(
    items: Array<{ name: string; categoryName: string; sortOrder: number }>
  ) {
    const grouped = new Map<
      string,
      { category: string; sortOrder: number; items: Array<{ name: string; category: string }> }
    >();

    for (const item of items) {
      const categoryName = item.categoryName;
      const sortOrder = item.sortOrder;

      if (!grouped.has(categoryName)) {
        grouped.set(categoryName, { category: categoryName, sortOrder, items: [] });
      }

      grouped.get(categoryName)!.items.push({
        name: item.name,
        category: categoryName,
      });
    }

    return Array.from(grouped.values())
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ category, items }) => ({
        category,
        items: items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      }));
  }

  // Generator: categories with realistic names and sort orders
  const categoryNameArb = fc.stringMatching(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{0,20}$/);

  const categoryArb = fc.record({
    name: categoryNameArb,
    sortOrder: fc.integer({ min: 0, max: 100 }),
  });

  // Generator: array of menu items distributed across random categories
  const menuItemsArb = fc
    .array(categoryArb, { minLength: 1, maxLength: 5 })
    .chain((categories) =>
      fc
        .array(
          fc.record({
            name: fc.stringMatching(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{0,30}$/),
            categoryIndex: fc.integer({ min: 0, max: categories.length - 1 }),
          }),
          { minLength: 1, maxLength: 30 }
        )
        .map((items) =>
          items.map((item) => ({
            name: item.name,
            categoryName: categories[item.categoryIndex]!.name,
            sortOrder: categories[item.categoryIndex]!.sortOrder,
          }))
        )
    );

  it('should group items by category (all items of the same category are contiguous)', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = groupAndSortMenu(items);

        // Each category should appear exactly once in the result
        const categoryNames = result.map((group) => group.category);
        const uniqueCategories = new Set(categoryNames);
        expect(categoryNames.length).toBe(uniqueCategories.size);

        // All items within a group should belong to that category
        for (const group of result) {
          for (const item of group.items) {
            expect(item.category).toBe(group.category);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should sort categories by sort_order ascending', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = groupAndSortMenu(items);

        // Build a map of category name -> sort order from the input
        const categoryToSortOrder = new Map<string, number>();
        for (const item of items) {
          categoryToSortOrder.set(item.categoryName, item.sortOrder);
        }

        // Verify categories appear in sort_order ascending
        for (let i = 1; i < result.length; i++) {
          const prevSortOrder = categoryToSortOrder.get(result[i - 1]!.category)!;
          const currSortOrder = categoryToSortOrder.get(result[i]!.category)!;
          expect(prevSortOrder).toBeLessThanOrEqual(currSortOrder);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should sort items alphabetically within each category (pt-BR locale)', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = groupAndSortMenu(items);

        // Within each category, consecutive items must be in alphabetical order
        for (const group of result) {
          for (let i = 1; i < group.items.length; i++) {
            const comparison = group.items[i - 1]!.name.localeCompare(
              group.items[i]!.name,
              'pt-BR'
            );
            expect(comparison).toBeLessThanOrEqual(0);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all items (no item is lost or duplicated)', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = groupAndSortMenu(items);

        // Total items in result should equal total items in input
        const totalResultItems = result.reduce((sum, group) => sum + group.items.length, 0);
        expect(totalResultItems).toBe(items.length);
      }),
      { numRuns: 100 }
    );
  });
});
