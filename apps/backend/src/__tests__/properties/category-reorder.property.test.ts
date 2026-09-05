import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

/**
 * Feature: categories-crud, Property 5: Reorder assigns position-based sort_order
 *
 * For any valid permutation of all existing category IDs submitted to the reorder
 * endpoint, after successful processing, each category's sort_order SHALL equal
 * its zero-based index position in the submitted list.
 *
 * **Validates: Requirements 4.1**
 */

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
import { reorderCategories } from '../../controllers/category.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(body: any): Partial<AuthenticatedRequest> {
  return {
    body,
    params: {},
    user: { id: 'admin-user-1', email: 'admin@test.com' },
    tenantId: 'tenant-1',
  } as Partial<AuthenticatedRequest>;
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
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

describe('Property 5: Reorder assigns position-based sort_order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any valid permutation of category IDs, each category sort_order equals its index position', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-10 unique UUIDs representing category IDs
        fc.array(fc.uuid(), { minLength: 2, maxLength: 10 })
          .filter((ids) => new Set(ids).size === ids.length)
          .chain((ids) =>
            // Generate a random permutation of the IDs
            fc.shuffledSubarray(ids, { minLength: ids.length, maxLength: ids.length })
              .map((permutation) => ({ originalIds: ids, permutation }))
          ),
        async ({ originalIds, permutation }) => {
          // Reset mocks for each iteration
          vi.mocked(pool.query).mockReset();
          vi.mocked(pool.connect).mockReset();

          // Mock pool.query for the existing categories check and final result
          vi.mocked(pool.query).mockImplementation(async (query: any) => {
            const queryStr = typeof query === 'string' ? query : '';

            // Tenant-scoped select of existing categories (repo.select('categories'))
            if (queryStr.includes('SELECT * FROM categories')) {
              // Return all original IDs as existing categories
              return { rows: originalIds.map((id) => ({ id })) } as any;
            }

            if (queryStr.includes('SELECT c.id')) {
              // Return categories with sort_order matching the submitted permutation order
              const rows = permutation.map((id, index) => ({
                id,
                name: `Category ${index}`,
                sort_order: index,
                status: 'ativo',
                item_count: 0,
                created_at: '2024-01-01T00:00:00Z',
              }));
              return { rows } as any;
            }

            return { rows: [] } as any;
          });

          // Mock pool.connect for transaction
          const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn(),
          };
          vi.mocked(pool.connect).mockResolvedValue(mockClient as any);

          const req = mockRequest({ categoryIds: permutation });
          const res = mockResponse();

          await invokeHandler(reorderCategories, req as AuthenticatedRequest,
            res as Response,
          );

          // Verify successful response
          expect(res.statusCode).toBe(200);
          expect(Array.isArray(res.body)).toBe(true);

          // Verify each category's sortOrder equals its index in the submitted permutation
          for (let i = 0; i < permutation.length; i++) {
            const category = res.body.find((c: any) => c.id === permutation[i]);
            expect(category).toBeDefined();
            expect(category.sortOrder).toBe(i);
          }

          // Verify the transaction client was called with correct UPDATE queries
          expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
          expect(mockClient.query).toHaveBeenCalledWith('COMMIT');

          // Verify each category ID was updated with the correct sort_order.
          // Via the TenantRepository the UPDATE is tenant-scoped, so the params
          // are [sortOrder, tenantId, categoryId] and the WHERE includes tenant_id.
          for (let i = 0; i < permutation.length; i++) {
            expect(mockClient.query).toHaveBeenCalledWith(
              expect.stringContaining('UPDATE categories SET sort_order'),
              [i, 'tenant-1', permutation[i]],
            );
          }

          // Verify client was released
          expect(mockClient.release).toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
