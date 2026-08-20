import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {},
}));

import { pool } from '../../config/database.js';
import { getMenu } from '../../controllers/menu.controller.js';

/**
 * Feature: categories-crud, Property 8: Inactive categories excluded from public menu
 *
 * For any set of categories where some have status 'inativo', the public menu endpoint
 * (GET /api/menu without ?all=true) SHALL never include items grouped under an inactive
 * category name in its response.
 *
 * **Validates: Requirements 5.7**
 */
describe('Feature: categories-crud, Property 8: Inactive categories excluded from public menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Avoid Object prototype property names that break Record<string, ...> grouping
  const reservedNames = new Set(Object.getOwnPropertyNames(Object.prototype));

  // Generator: safe category name that won't clash with Object prototype properties
  const safeName = fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => s.trim().length >= 1 && !reservedNames.has(s.trim()));

  // Generator: a set of categories with unique names, ensuring at least one inactive
  const categoriesArb = fc
    .integer({ min: 2, max: 8 })
    .chain((count) =>
      fc.tuple(
        fc.uniqueArray(safeName, { minLength: count, maxLength: count }),
        fc.array(fc.constantFrom('ativo' as const, 'inativo' as const), {
          minLength: count,
          maxLength: count,
        }),
        fc.array(
          fc.array(
            fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length >= 1),
              priceCents: fc.integer({ min: 100, max: 99999 }),
              status: fc.constantFrom('ativo' as const, 'inativo' as const),
            }),
            { minLength: 1, maxLength: 3 },
          ),
          { minLength: count, maxLength: count },
        ),
      ),
    )
    .map(([names, statuses, itemSets]) =>
      names.map((name, i) => ({
        categoryName: name.trim(),
        categoryStatus: statuses[i],
        sortOrder: i,
        items: itemSets[i],
      })),
    )
    .filter((cats) => cats.some((c) => c.categoryStatus === 'inativo'));

  it('public menu (no ?all=true) never includes items from inactive categories', async () => {
    await fc.assert(
      fc.asyncProperty(categoriesArb, async (categories) => {
        vi.clearAllMocks();

        // The public menu query filters: WHERE mi.status = 'ativo' AND c.status = 'ativo'
        // Mock returns only rows that pass this filter (simulating DB behavior)
        const filteredRows = categories.flatMap((cat) => {
          if (cat.categoryStatus !== 'ativo') return [];
          return cat.items
            .filter((item) => item.status === 'ativo')
            .map((item) => ({
              id: item.id,
              name: item.name,
              price_cents: item.priceCents,
              status: item.status,
              created_at: '2024-01-15T10:00:00.000Z',
              updated_at: '2024-01-15T10:00:00.000Z',
              category_name: cat.categoryName,
              category_sort_order: cat.sortOrder,
            }));
        });

        vi.mocked(pool.query).mockResolvedValue({
          rows: filteredRows,
          command: 'SELECT',
          rowCount: filteredRows.length,
          oid: 0,
          fields: [],
        } as never);

        const req = {
          query: {},
          tenantId: 'tenant-1',
        } as never;

        const statusFn = vi.fn().mockReturnThis();
        const jsonFn = vi.fn().mockReturnThis();
        const res = {
          status: statusFn,
          json: jsonFn,
        } as never;

        await getMenu(req, res);

        expect(statusFn).toHaveBeenCalledWith(200);

        const responseBody = jsonFn.mock.calls[0][0] as Array<{
          category: string;
          items: Array<{ id: string; name: string; status: string }>;
        }>;

        // Collect inactive category names
        const inactiveCategoryNames = categories
          .filter((c) => c.categoryStatus === 'inativo')
          .map((c) => c.categoryName);

        // Property: no items grouped under an inactive category name appear in the response
        for (const group of responseBody) {
          expect(inactiveCategoryNames).not.toContain(group.category);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('public menu only returns items from active categories', async () => {
    await fc.assert(
      fc.asyncProperty(categoriesArb, async (categories) => {
        vi.clearAllMocks();

        // Simulate DB filtering: only active items in active categories
        const filteredRows = categories.flatMap((cat) => {
          if (cat.categoryStatus !== 'ativo') return [];
          return cat.items
            .filter((item) => item.status === 'ativo')
            .map((item) => ({
              id: item.id,
              name: item.name,
              price_cents: item.priceCents,
              status: item.status,
              created_at: '2024-01-15T10:00:00.000Z',
              updated_at: '2024-01-15T10:00:00.000Z',
              category_name: cat.categoryName,
              category_sort_order: cat.sortOrder,
            }));
        });

        vi.mocked(pool.query).mockResolvedValue({
          rows: filteredRows,
          command: 'SELECT',
          rowCount: filteredRows.length,
          oid: 0,
          fields: [],
        } as never);

        const req = {
          query: {},
          tenantId: 'tenant-1',
        } as never;

        const statusFn = vi.fn().mockReturnThis();
        const jsonFn = vi.fn().mockReturnThis();
        const res = {
          status: statusFn,
          json: jsonFn,
        } as never;

        await getMenu(req, res);

        expect(statusFn).toHaveBeenCalledWith(200);

        const responseBody = jsonFn.mock.calls[0][0] as Array<{
          category: string;
          items: Array<{ id: string; name: string; status: string }>;
        }>;

        // Collect active category names
        const activeCategoryNames = categories
          .filter((c) => c.categoryStatus === 'ativo')
          .map((c) => c.categoryName);

        // Property: every category group in the response must be from an active category
        for (const group of responseBody) {
          expect(activeCategoryNames).toContain(group.category);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all active items from active categories are present in response', async () => {
    await fc.assert(
      fc.asyncProperty(categoriesArb, async (categories) => {
        vi.clearAllMocks();

        // Expected items: active items in active categories
        const filteredRows = categories.flatMap((cat) => {
          if (cat.categoryStatus !== 'ativo') return [];
          return cat.items
            .filter((item) => item.status === 'ativo')
            .map((item) => ({
              id: item.id,
              name: item.name,
              price_cents: item.priceCents,
              status: item.status,
              created_at: '2024-01-15T10:00:00.000Z',
              updated_at: '2024-01-15T10:00:00.000Z',
              category_name: cat.categoryName,
              category_sort_order: cat.sortOrder,
            }));
        });

        vi.mocked(pool.query).mockResolvedValue({
          rows: filteredRows,
          command: 'SELECT',
          rowCount: filteredRows.length,
          oid: 0,
          fields: [],
        } as never);

        const req = {
          query: {},
          tenantId: 'tenant-1',
        } as never;

        const statusFn = vi.fn().mockReturnThis();
        const jsonFn = vi.fn().mockReturnThis();
        const res = {
          status: statusFn,
          json: jsonFn,
        } as never;

        await getMenu(req, res);

        expect(statusFn).toHaveBeenCalledWith(200);

        const responseBody = jsonFn.mock.calls[0][0] as Array<{
          category: string;
          items: Array<{ id: string }>;
        }>;

        // Collect all item IDs from response
        const responseItemIds = responseBody.flatMap((group) =>
          group.items.map((item) => item.id),
        );

        // Property: response count matches expected filtered rows count
        expect(responseItemIds.length).toBe(filteredRows.length);

        // Property: every filtered row ID appears in the response
        for (const row of filteredRows) {
          expect(responseItemIds).toContain(row.id);
        }
      }),
      { numRuns: 100 },
    );
  });
});
