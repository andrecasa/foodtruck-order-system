import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

/**
 * Feature: categories-crud, Property 6: Reorder list completeness
 *
 * For any list of category IDs submitted to the reorder endpoint, if the list
 * contains duplicate IDs, or does not contain exactly all existing category IDs
 * (missing or extra), the system SHALL reject the request with HTTP 422.
 *
 * **Validates: Requirements 4.2, 4.5**
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

describe('Property 6: Reorder list completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects lists with duplicate IDs with 422 and correct message', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 2-8 unique UUIDs, then create a list with at least one duplicate
        fc.array(fc.uuid(), { minLength: 2, maxLength: 8 })
          .filter((ids) => new Set(ids).size === ids.length)
          .chain((uniqueIds) =>
            // Pick a random index to duplicate
            fc.integer({ min: 0, max: uniqueIds.length - 1 }).map((dupIdx) => {
              // Insert a duplicate of the element at dupIdx into a random position
              const listWithDup = [...uniqueIds, uniqueIds[dupIdx]];
              return { existingIds: uniqueIds, submittedIds: listWithDup };
            })
          ),
        async ({ existingIds, submittedIds }) => {
          vi.mocked(pool.query).mockReset();

          // Mock existing categories - should not be reached because duplicate check comes first
          vi.mocked(pool.query).mockImplementation(async (query: any) => {
            const queryStr = typeof query === 'string' ? query : '';
            if (queryStr.includes('SELECT * FROM categories')) {
              return { rows: existingIds.map((id) => ({ id })) } as any;
            }
            return { rows: [] } as any;
          });

          const req = mockRequest({ categoryIds: submittedIds });
          const res = mockResponse();

          await invokeHandler(reorderCategories, req as AuthenticatedRequest, res as Response);

          expect(res.statusCode).toBe(422);
          expect(res.body.message).toBe('Lista contém categorias duplicadas');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects lists missing existing category IDs with 422 and correct message', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 3-8 unique UUIDs as existing categories, then submit a strict subset
        fc.array(fc.uuid(), { minLength: 3, maxLength: 8 })
          .filter((ids) => new Set(ids).size === ids.length)
          .chain((existingIds) =>
            // Remove 1 to n-1 items to create a subset
            fc.integer({ min: 1, max: existingIds.length - 1 }).map((removeCount) => {
              const submittedIds = existingIds.slice(0, existingIds.length - removeCount);
              return { existingIds, submittedIds };
            })
          ),
        async ({ existingIds, submittedIds }) => {
          vi.mocked(pool.query).mockReset();

          vi.mocked(pool.query).mockImplementation(async (query: any) => {
            const queryStr = typeof query === 'string' ? query : '';
            if (queryStr.includes('SELECT * FROM categories')) {
              return { rows: existingIds.map((id) => ({ id })) } as any;
            }
            return { rows: [] } as any;
          });

          const req = mockRequest({ categoryIds: submittedIds });
          const res = mockResponse();

          await invokeHandler(reorderCategories, req as AuthenticatedRequest, res as Response);

          expect(res.statusCode).toBe(422);
          expect(res.body.message).toBe('A lista deve conter todas as categorias');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects lists with extra/non-existent IDs with 422 and correct message', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate existing IDs and extra IDs that don't exist in the DB
        fc.array(fc.uuid(), { minLength: 2, maxLength: 6 })
          .filter((ids) => new Set(ids).size === ids.length)
          .chain((existingIds) =>
            fc.array(fc.uuid(), { minLength: 1, maxLength: 3 })
              .filter((extraIds) => {
                const existingSet = new Set(existingIds);
                return extraIds.every((id) => !existingSet.has(id)) &&
                  new Set(extraIds).size === extraIds.length;
              })
              .map((extraIds) => ({
                existingIds,
                submittedIds: [...existingIds, ...extraIds],
              }))
          ),
        async ({ existingIds, submittedIds }) => {
          vi.mocked(pool.query).mockReset();

          vi.mocked(pool.query).mockImplementation(async (query: any) => {
            const queryStr = typeof query === 'string' ? query : '';
            if (queryStr.includes('SELECT * FROM categories')) {
              return { rows: existingIds.map((id) => ({ id })) } as any;
            }
            return { rows: [] } as any;
          });

          const req = mockRequest({ categoryIds: submittedIds });
          const res = mockResponse();

          await invokeHandler(reorderCategories, req as AuthenticatedRequest, res as Response);

          expect(res.statusCode).toBe(422);
          expect(res.body.message).toBe('Categoria não encontrada na lista');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects empty list with 422 (caught by Zod validation)', async () => {
    vi.mocked(pool.query).mockReset();

    const req = mockRequest({ categoryIds: [] });
    const res = mockResponse();

    await invokeHandler(reorderCategories, req as AuthenticatedRequest, res as Response);

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe('Lista de categorias não pode estar vazia');
  });
});
