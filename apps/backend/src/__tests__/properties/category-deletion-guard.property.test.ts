import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { deleteCategory } from '../../controllers/category.controller.js';

/**
 * Feature: categories-crud, Property 9: Deletion guard
 *
 * For any category, deletion SHALL succeed if and only if the category has zero
 * associated menu items (regardless of item status). If the category has at least
 * one associated menu item, deletion SHALL be rejected with HTTP 422.
 *
 * **Validates: Requirements 6.1, 6.2**
 */
describe('Feature: categories-crud, Property 9: Deletion guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID for category ID
  const categoryId = fc.uuid();

  // Generator: item count > 0 (category has associated items)
  const positiveItemCount = fc.integer({ min: 1, max: 500 });

  it('category with associated items → deletion rejected with HTTP 422', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryId,
        positiveItemCount,
        async (id, itemCount) => {
          vi.clearAllMocks();

          let queryCall = 0;
          vi.mocked(pool.query).mockImplementation(async () => {
            queryCall++;
            if (queryCall === 1) {
              // Category exists
              return {
                rows: [{ id }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            } else {
              // Associated items count > 0
              return {
                rows: [{ count: itemCount }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
          });

          const req = {
            params: { id },
            tenantId: 'tenant-1',
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          await deleteCategory(req, res);

          // Property: deletion is rejected with HTTP 422
          expect(statusFn).toHaveBeenCalledWith(422);

          // Property: correct error message
          const responseBody = jsonFn.mock.calls[0][0];
          expect(responseBody.message).toBe(
            'Categoria possui itens associados. Mova ou exclua os itens antes de excluir a categoria',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('category with 0 items → deletion succeeds with HTTP 200', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryId,
        async (id) => {
          vi.clearAllMocks();

          let queryCall = 0;
          vi.mocked(pool.query).mockImplementation(async () => {
            queryCall++;
            if (queryCall === 1) {
              // Category exists
              return {
                rows: [{ id }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            } else if (queryCall === 2) {
              // Associated items = none (tenant-scoped select returns empty rows)
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            } else {
              // DELETE succeeds
              return {
                rows: [],
                command: 'DELETE',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
          });

          const req = {
            params: { id },
            tenantId: 'tenant-1',
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          await deleteCategory(req, res);

          // Property: deletion succeeds with HTTP 200
          expect(statusFn).toHaveBeenCalledWith(200);

          // Property: correct success message
          const responseBody = jsonFn.mock.calls[0][0];
          expect(responseBody.message).toBe('Categoria excluída com sucesso');
        },
      ),
      { numRuns: 100 },
    );
  });
});
