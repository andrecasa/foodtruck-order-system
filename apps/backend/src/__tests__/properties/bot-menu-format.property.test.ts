import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock side-effect dependencies to allow importing pure functions
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

import { formatPriceBRL, formatMenu } from '../../bot/whatsapp.service.js';

/**
 * Feature: food-truck-order-system, Property 18: Formatação do cardápio (R$ X,XX, agrupado)
 *
 * Para qualquer conjunto de itens ativos, a mensagem formatada pelo Bot deve agrupar
 * itens por categoria e exibir cada item com nome e preço no formato "R$ X,XX"
 * (com vírgula como separador decimal e duas casas).
 *
 * **Validates: Requirements 11.2**
 */
describe('Property 18: Formatação do cardápio (R$ X,XX, agrupado)', () => {
  // --- Generators ---

  const categoryNameArb = fc.stringMatching(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,20}$/);
  const itemNameArb = fc.stringMatching(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ]{1,25}$/);
  const priceCentsArb = fc.integer({ min: 1, max: 999999 });

  // Generate a set of menu items across random categories
  const menuItemsArb = fc
    .array(
      fc.record({
        name: categoryNameArb,
        sortOrder: fc.integer({ min: 0, max: 100 }),
      }),
      { minLength: 1, maxLength: 5 }
    )
    .chain((categories) =>
      fc
        .array(
          fc.record({
            name: itemNameArb,
            priceCents: priceCentsArb,
            categoryIndex: fc.integer({ min: 0, max: categories.length - 1 }),
          }),
          { minLength: 1, maxLength: 20 }
        )
        .map((items) =>
          items.map((item, idx) => ({
            id: `item-${idx}`,
            name: item.name,
            price_cents: item.priceCents,
            category_name: categories[item.categoryIndex]!.name,
            category_sort_order: categories[item.categoryIndex]!.sortOrder,
          }))
        )
    );

  // --- Property: formatPriceBRL produces correct format ---

  it('formatPriceBRL always produces a string matching "R$ X,XX" pattern', () => {
    fc.assert(
      fc.property(priceCentsArb, (cents) => {
        const result = formatPriceBRL(cents);

        // Must match R$ followed by digits, comma, and exactly 2 digits
        const pattern = /^R\$ \d+,\d{2}$/;
        expect(result).toMatch(pattern);

        // Verify the comma is the decimal separator (not a dot)
        expect(result).toContain(',');
        expect(result).not.toMatch(/\.\d{2}$/);

        // Verify the numeric value is correct
        const reais = Math.floor(cents / 100);
        const centavos = cents % 100;
        const expected = `R$ ${reais},${centavos.toString().padStart(2, '0')}`;
        expect(result).toBe(expected);
      }),
      { numRuns: 200 }
    );
  });

  // --- Property: formatMenu groups items by category ---

  it('formatMenu groups items by category (each category appears as a heading)', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = formatMenu(items);

        // Collect unique category names from input
        const categoryNames = new Set(items.map((i) => i.category_name));

        // Each category must appear as a *CategoryName* heading in the output
        for (const category of categoryNames) {
          expect(result).toContain(`*${category}*`);
        }
      }),
      { numRuns: 100 }
    );
  });

  // --- Property: every item's name is present in the formatted menu ---

  it('formatMenu includes every item name in the output', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = formatMenu(items);

        for (const item of items) {
          expect(result).toContain(item.name);
        }
      }),
      { numRuns: 100 }
    );
  });

  // --- Property: every item's price (formatted) is present in the menu ---

  it('formatMenu includes every item price in R$ X,XX format', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = formatMenu(items);

        for (const item of items) {
          const formattedPrice = formatPriceBRL(item.price_cents);
          expect(result).toContain(formattedPrice);
        }
      }),
      { numRuns: 100 }
    );
  });

  // --- Property: items within a category are contiguous (grouped) ---

  it('formatMenu keeps items of the same category contiguous (not interleaved)', () => {
    fc.assert(
      fc.property(menuItemsArb, (items) => {
        const result = formatMenu(items);
        const lines = result.split('\n');

        // Find category heading positions
        const categoryPositions: { name: string; lineIndex: number }[] = [];
        for (let i = 0; i < lines.length; i++) {
          const headingMatch = lines[i]!.match(/^\*(.+)\*$/);
          if (headingMatch) {
            categoryPositions.push({ name: headingMatch[1]!, lineIndex: i });
          }
        }

        // Each category heading should appear exactly once
        const headingNames = categoryPositions.map((c) => c.name);
        const uniqueHeadings = new Set(headingNames);
        expect(headingNames.length).toBe(uniqueHeadings.size);

        // Count how many items should be in each category
        const expectedItemCountByCategory = new Map<string, number>();
        for (const item of items) {
          const count = expectedItemCountByCategory.get(item.category_name) || 0;
          expectedItemCountByCategory.set(item.category_name, count + 1);
        }

        // For each category section, count the numbered item lines
        for (let i = 0; i < categoryPositions.length; i++) {
          const startLine = categoryPositions[i]!.lineIndex + 1;
          const endLine =
            i + 1 < categoryPositions.length
              ? categoryPositions[i + 1]!.lineIndex
              : lines.length;

          const categoryName = categoryPositions[i]!.name;
          let itemLineCount = 0;

          for (let j = startLine; j < endLine; j++) {
            // Lines that start with a number followed by a dot are item lines
            if (lines[j]!.match(/^\d+\./)) {
              itemLineCount++;
            }
          }

          // The number of item lines in this section should match the input count
          const expectedCount = expectedItemCountByCategory.get(categoryName) || 0;
          expect(itemLineCount).toBe(expectedCount);
        }
      }),
      { numRuns: 100 }
    );
  });
});
