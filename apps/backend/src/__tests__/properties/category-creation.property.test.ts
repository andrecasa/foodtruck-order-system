import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { createCategory } from '../../controllers/category.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

/**
 * Feature: categories-crud, Property 4: Creation assigns correct defaults
 *
 * For any valid category name, upon successful creation the resulting category
 * SHALL have: name equal to the trimmed input, sort_order equal to
 * (max existing sort_order + 1) or 0 if no categories exist, and status equal to 'ativo'.
 *
 * **Validates: Requirements 2.1**
 */
describe('Feature: categories-crud, Property 4: Creation assigns correct defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid category name (1-100 chars, not whitespace-only)
  const validName = fc
    .string({ minLength: 1, maxLength: 100 })
    .filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

  // Generator: existing max sort_order (-1 means no categories exist)
  const existingMaxSortOrder = fc.integer({ min: -1, max: 1000 });

  it('creation assigns trimmed name, correct sort_order, and status ativo', async () => {
    await fc.assert(
      fc.asyncProperty(
        validName,
        existingMaxSortOrder,
        async (name, maxSortOrder) => {
          vi.clearAllMocks();

          const trimmedName = name.trim();
          const expectedSortOrder = maxSortOrder + 1;
          const fakeId = 'fake-uuid-id';
          const fakeCreatedAt = '2024-01-15T10:00:00.000Z';

          // Mock pool.query responses in order:
          // 1. Uniqueness check: no existing category with same name
          // 2. Max sort_order query: return the generated max value
          // 3. Insert: return the inserted row with computed values
          let queryCall = 0;
          vi.mocked(pool.query).mockImplementation(async () => {
            queryCall++;
            if (queryCall === 1) {
              // Uniqueness check - no duplicate found
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            } else if (queryCall === 2) {
              // Max sort_order query
              return {
                rows: [{ max_sort_order: maxSortOrder }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            } else {
              // Insert - return the created row
              return {
                rows: [{
                  id: fakeId,
                  name: trimmedName,
                  sort_order: expectedSortOrder,
                  status: 'ativo',
                  created_at: fakeCreatedAt,
                }],
                command: 'INSERT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
          });

          // Create mock Express req/res (tenantId resolved by tenantMiddleware)
          const req = {
            body: { name },
            tenantId: 'tenant-1',
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          // Call createCategory
          await invokeHandler(createCategory, req, res);

          // Property: response status is 201
          expect(statusFn).toHaveBeenCalledWith(201);

          // Property: response body has correct defaults
          const responseBody = jsonFn.mock.calls[0][0];
          expect(responseBody.name).toBe(trimmedName);
          expect(responseBody.sortOrder).toBe(expectedSortOrder);
          expect(responseBody.status).toBe('ativo');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('creation with no existing categories assigns sort_order 0', async () => {
    await fc.assert(
      fc.asyncProperty(
        validName,
        async (name) => {
          vi.clearAllMocks();

          const trimmedName = name.trim();
          const fakeId = 'fake-uuid-id';
          const fakeCreatedAt = '2024-01-15T10:00:00.000Z';

          let queryCall = 0;
          vi.mocked(pool.query).mockImplementation(async () => {
            queryCall++;
            if (queryCall === 1) {
              // Uniqueness check - no duplicate found
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            } else if (queryCall === 2) {
              // Max sort_order query - no categories exist (COALESCE returns -1)
              return {
                rows: [{ max_sort_order: -1 }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            } else {
              // Insert - return the created row with sort_order 0
              return {
                rows: [{
                  id: fakeId,
                  name: trimmedName,
                  sort_order: 0,
                  status: 'ativo',
                  created_at: fakeCreatedAt,
                }],
                command: 'INSERT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
          });

          const req = {
            body: { name },
            tenantId: 'tenant-1',
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          await invokeHandler(createCategory, req, res);

          // Property: response status is 201
          expect(statusFn).toHaveBeenCalledWith(201);

          // Property: sort_order is 0 when no categories exist
          const responseBody = jsonFn.mock.calls[0][0];
          expect(responseBody.name).toBe(trimmedName);
          expect(responseBody.sortOrder).toBe(0);
          expect(responseBody.status).toBe('ativo');
        },
      ),
      { numRuns: 100 },
    );
  });
});
