import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { toggleCategoryStatus } from '../../controllers/category.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

/**
 * Feature: categories-crud, Property 7: Deactivation guard
 *
 * For any category, deactivation SHALL succeed if and only if the category has
 * status 'ativo' AND has zero menu items with status 'ativo'. If the category
 * has at least one active menu item, deactivation SHALL be rejected with HTTP 422.
 *
 * **Validates: Requirements 5.1, 5.2**
 */
describe('Feature: categories-crud, Property 7: Deactivation guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: positive active item count (at least 1)
  const activeItemCount = fc.integer({ min: 1, max: 50 });

  // Generator: UUID-like category ID
  const categoryId = fc.uuid();

  // Generator: category name
  const categoryName = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length >= 1);

  it('deactivation rejected when category has active items (HTTP 422)', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryId,
        categoryName,
        activeItemCount,
        async (id, name, itemCount) => {
          vi.clearAllMocks();

          let queryCall = 0;
          vi.mocked(pool.query).mockImplementation(async () => {
            queryCall++;
            if (queryCall === 1) {
              // 1. Category exists with status 'ativo'
              return {
                rows: [{
                  id,
                  name: name.trim(),
                  sort_order: 0,
                  status: 'ativo',
                  created_at: '2024-01-15T10:00:00.000Z',
                }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            } else {
              // 2. Active items count > 0
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
            body: { action: 'deactivate' },
            tenantId: 'tenant-1',
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          await invokeHandler(toggleCategoryStatus, req, res);

          // Property: deactivation is rejected with 422
          expect(statusFn).toHaveBeenCalledWith(422);
          const responseBody = jsonFn.mock.calls[0][0];
          expect(responseBody.message).toBe(
            'Categoria possui itens ativos. Desative os itens antes de desativar a categoria',
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deactivation succeeds when category has 0 active items (HTTP 200)', async () => {
    await fc.assert(
      fc.asyncProperty(
        categoryId,
        categoryName,
        async (id, name) => {
          vi.clearAllMocks();

          const trimmedName = name.trim();
          let queryCall = 0;
          vi.mocked(pool.query).mockImplementation(async () => {
            queryCall++;
            if (queryCall === 1) {
              // 1. Category exists with status 'ativo'
              return {
                rows: [{
                  id,
                  name: trimmedName,
                  sort_order: 0,
                  status: 'ativo',
                  created_at: '2024-01-15T10:00:00.000Z',
                }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            } else if (queryCall === 2) {
              // 2. Active items = none (tenant-scoped select returns empty rows)
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            } else {
              // 3. Update to inativo (rowCount) and 4. re-read returns updated row
              return {
                rows: [{
                  id,
                  name: trimmedName,
                  sort_order: 0,
                  status: 'inativo',
                  created_at: '2024-01-15T10:00:00.000Z',
                }],
                command: 'UPDATE',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
          });

          const req = {
            params: { id },
            body: { action: 'deactivate' },
            tenantId: 'tenant-1',
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          await invokeHandler(toggleCategoryStatus, req, res);

          // Property: deactivation succeeds with 200
          expect(statusFn).toHaveBeenCalledWith(200);
          const responseBody = jsonFn.mock.calls[0][0];
          expect(responseBody.status).toBe('inativo');
        },
      ),
      { numRuns: 100 },
    );
  });
});
