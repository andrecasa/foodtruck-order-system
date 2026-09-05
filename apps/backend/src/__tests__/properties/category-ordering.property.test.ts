import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

/**
 * Feature: categories-crud, Property 1: Ordering invariant
 *
 * For any set of categories returned by the list endpoint, the categories SHALL be
 * sorted by sort_order in ascending order; for any two categories with equal sort_order,
 * they SHALL be sorted by name in ascending alphabetical order.
 *
 * **Validates: Requirements 1.2**
 */

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { listCategories } from '../../controllers/category.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(): Partial<AuthenticatedRequest> {
  return {
    body: {},
    params: {},
    user: { id: 'user-1', email: 'admin@test.com' },
    tenantId: 'tenant-1',
  } as Partial<AuthenticatedRequest>;
}

function mockResponse(): { statusCode: number; body: any; status: (code: number) => any; json: (data: any) => any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

// Generator: category row as returned by the SQL query
const categoryRowArb = fc.record({
  id: fc.uuid(),
  name: fc.stringMatching(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ]{0,30}$/),
  sort_order: fc.integer({ min: 0, max: 50 }),
  status: fc.constantFrom('ativo', 'inativo'),
  created_at: fc.constant('2024-01-01T00:00:00.000Z'),
  item_count: fc.integer({ min: 0, max: 100 }),
});

// Generator: array of category rows (1 to 20 categories)
const categoryRowsArb = fc.array(categoryRowArb, { minLength: 1, maxLength: 20 });

describe('Feature: categories-crud, Property 1: Ordering invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listCategories returns categories sorted by sort_order ASC then name ASC', async () => {
    await fc.assert(
      fc.asyncProperty(categoryRowsArb, async (rows) => {
        vi.clearAllMocks();

        // Simulate DB behavior: sort rows by sort_order ASC, name ASC (what the SQL query does)
        const sortedRows = [...rows].sort((a, b) => {
          if (a.sort_order !== b.sort_order) {
            return a.sort_order - b.sort_order;
          }
          return a.name.localeCompare(b.name);
        });

        // Mock pool.query to return the pre-sorted rows (simulating the DB ORDER BY)
        vi.mocked(pool.query).mockResolvedValue({
          rows: sortedRows,
          command: 'SELECT',
          rowCount: sortedRows.length,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest();
        const res = mockResponse();

        await invokeHandler(listCategories, req as AuthenticatedRequest, res as unknown as Response);

        // Should succeed
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        const categories = res.body as Array<{ id: string; name: string; sortOrder: number; status: string; itemCount: number; createdAt: string }>;

        // Property: for consecutive categories, sort_order must be non-decreasing
        // When sort_order is equal, name must be in ascending alphabetical order
        for (let i = 0; i < categories.length - 1; i++) {
          const current = categories[i]!;
          const next = categories[i + 1]!;

          if (current.sortOrder === next.sortOrder) {
            // Tie-break by name ascending
            expect(current.name.localeCompare(next.name)).toBeLessThanOrEqual(0);
          } else {
            // sort_order must be strictly increasing
            expect(current.sortOrder).toBeLessThan(next.sortOrder);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('categories with equal sort_order are ordered by name alphabetically', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate categories that all share the same sort_order to stress the name tie-breaking
        fc.integer({ min: 0, max: 50 }).chain((sharedSortOrder) =>
          fc.array(
            fc.record({
              id: fc.uuid(),
              name: fc.stringMatching(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ]{0,30}$/),
              sort_order: fc.constant(sharedSortOrder),
              status: fc.constantFrom('ativo', 'inativo'),
              created_at: fc.constant('2024-01-01T00:00:00.000Z'),
              item_count: fc.integer({ min: 0, max: 100 }),
            }),
            { minLength: 2, maxLength: 15 },
          )
        ),
        async (rows) => {
          vi.clearAllMocks();

          // Sort by name (since all have same sort_order)
          const sortedRows = [...rows].sort((a, b) => a.name.localeCompare(b.name));

          vi.mocked(pool.query).mockResolvedValue({
            rows: sortedRows,
            command: 'SELECT',
            rowCount: sortedRows.length,
            oid: 0,
            fields: [],
          } as never);

          const req = mockRequest();
          const res = mockResponse();

          await invokeHandler(listCategories, req as AuthenticatedRequest, res as unknown as Response);

          expect(res.statusCode).toBe(200);

          const categories = res.body as Array<{ name: string; sortOrder: number }>;

          // All categories have the same sortOrder
          for (const cat of categories) {
            expect(cat.sortOrder).toBe(rows[0]!.sort_order);
          }

          // Names must be in non-decreasing alphabetical order
          for (let i = 0; i < categories.length - 1; i++) {
            expect(categories[i]!.name.localeCompare(categories[i + 1]!.name)).toBeLessThanOrEqual(0);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all input categories are preserved in the output (no loss or duplication)', async () => {
    await fc.assert(
      fc.asyncProperty(categoryRowsArb, async (rows) => {
        vi.clearAllMocks();

        // Sort as DB would
        const sortedRows = [...rows].sort((a, b) => {
          if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
          return a.name.localeCompare(b.name);
        });

        vi.mocked(pool.query).mockResolvedValue({
          rows: sortedRows,
          command: 'SELECT',
          rowCount: sortedRows.length,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest();
        const res = mockResponse();

        await invokeHandler(listCategories, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(200);

        const categories = res.body as Array<{ id: string }>;

        // Count must match
        expect(categories.length).toBe(rows.length);

        // All IDs from input are present in output
        const outputIds = new Set(categories.map((c) => c.id));
        for (const row of rows) {
          expect(outputIds.has(row.id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
