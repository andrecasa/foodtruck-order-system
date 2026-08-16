import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

/**
 * Feature: categories-crud, Property 3: Name uniqueness
 *
 * For any two distinct categories in the system, their names (after trim, compared
 * case-insensitively) SHALL be different. On creation, a duplicate name yields HTTP 409.
 * On update, a name matching another category (excluding self) yields HTTP 409, but
 * submitting the category's own current name (in any case variant) SHALL succeed.
 *
 * **Validates: Requirements 2.2, 3.2, 3.6**
 */

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { createCategory, updateCategory } from '../../controllers/category.controller.js';

function mockRequest(body: any, params: Record<string, string> = {}): Partial<AuthenticatedRequest> {
  return {
    body,
    params,
    user: { id: 'user-1', email: 'admin@test.com' },
  };
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

/**
 * Generator: produces a valid category name (1-100 chars after trim, not whitespace-only).
 * Uses Latin chars common in Portuguese category names.
 */
function validCategoryNameArb(): fc.Arbitrary<string> {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ0123456789'.split('');
  return fc.array(fc.constantFrom(...chars), { minLength: 1, maxLength: 50 })
    .map((c) => c.join(''))
    .filter((s) => s.trim().length > 0 && s.trim().length <= 100);
}

/**
 * Generator: produces a case variant of a given string by randomly toggling characters.
 */
function caseVariantArb(base: string): fc.Arbitrary<string> {
  if (base.length === 0) return fc.constant(base);
  return fc.array(fc.boolean(), { minLength: base.length, maxLength: base.length }).map(
    (toggles) =>
      base
        .split('')
        .map((ch, i) => (toggles[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join('')
  );
}

describe('Feature: categories-crud, Property 3: Name uniqueness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createCategory returns 409 when a category with the same name (case-insensitive) already exists', async () => {
    await fc.assert(
      fc.asyncProperty(validCategoryNameArb(), async (baseName) => {
        vi.clearAllMocks();

        // Generate a case variant to submit
        const variant = baseName
          .split('')
          .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');

        // Precondition: they are case-insensitively equal
        expect(baseName.trim().toLowerCase()).toBe(variant.trim().toLowerCase());

        // Mock pool.query:
        // 1st call: uniqueness check - returns an existing category with same name
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: 'existing-cat-1' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest({ name: variant });
        const res = mockResponse();

        await createCategory(req as AuthenticatedRequest, res as unknown as Response);

        // Must reject with 409
        expect(res.statusCode).toBe(409);
        expect(res.body.error).toBe('CONFLICT');
        expect(res.body.message).toBe('Já existe uma categoria com este nome');
      }),
      { numRuns: 100 },
    );
  });

  it('updateCategory returns 409 when another category has the same name (case-insensitive)', async () => {
    await fc.assert(
      fc.asyncProperty(validCategoryNameArb(), fc.uuid(), fc.uuid(), async (baseName, categoryId, otherId) => {
        // Ensure different IDs
        fc.pre(categoryId !== otherId);
        vi.clearAllMocks();

        const variant = baseName
          .split('')
          .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');

        // Mock pool.query calls in sequence:
        // 1st call: check category exists - found
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: categoryId, name: 'Old Name', sort_order: 0, created_at: '2024-01-01T00:00:00.000Z' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        // 2nd call: uniqueness check excluding self - another category has same name
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: otherId }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest({ name: variant }, { id: categoryId });
        const res = mockResponse();

        await updateCategory(req as AuthenticatedRequest, res as unknown as Response);

        // Must reject with 409
        expect(res.statusCode).toBe(409);
        expect(res.body.error).toBe('CONFLICT');
        expect(res.body.message).toBe('Já existe uma categoria com este nome');
      }),
      { numRuns: 100 },
    );
  });

  it('updateCategory with own current name (any case variant) succeeds with 200', async () => {
    await fc.assert(
      fc.asyncProperty(validCategoryNameArb(), fc.uuid(), async (baseName, categoryId) => {
        vi.clearAllMocks();

        const trimmedName = baseName.trim();

        // Generate a case variant of the category's own name
        const variant = trimmedName
          .split('')
          .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
          .join('');

        // Mock pool.query calls in sequence:
        // 1st call: check category exists - found with the base name
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: categoryId, name: trimmedName, sort_order: 0, created_at: '2024-01-01T00:00:00.000Z' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        // 2nd call: uniqueness check excluding self - no other category has this name
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        } as never);

        // 3rd call: UPDATE returning updated row
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: categoryId, name: variant.trim(), sort_order: 0, created_at: '2024-01-01T00:00:00.000Z' }],
          command: 'UPDATE',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest({ name: variant }, { id: categoryId });
        const res = mockResponse();

        await updateCategory(req as AuthenticatedRequest, res as unknown as Response);

        // Must NOT return 409 - should succeed with 200
        expect(res.statusCode).not.toBe(409);
        expect(res.statusCode).toBe(200);
      }),
      { numRuns: 100 },
    );
  });
});
