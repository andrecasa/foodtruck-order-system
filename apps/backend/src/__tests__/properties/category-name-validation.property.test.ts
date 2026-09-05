import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

/**
 * Feature: categories-crud, Property 2: Name validation
 *
 * For any string submitted as category name (on create or update), if the string
 * after trimming leading/trailing whitespace has length < 1 or > 100, or consists
 * entirely of whitespace characters, the system SHALL reject the request with HTTP 422.
 *
 * **Validates: Requirements 2.3, 3.4**
 */

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { createCategory, updateCategory } from '../../controllers/category.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(body: any, params: any = {}): Partial<AuthenticatedRequest> {
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

// Generator: empty string
const emptyStringArb = fc.constant('');

// Generator: whitespace-only strings (spaces, tabs, newlines)
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r', '  '), { minLength: 1, maxLength: 50 })
  .map((chars) => chars.join(''));

// Generator: strings that are longer than 100 characters after trim
const tooLongAfterTrimArb = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
    ),
    { minLength: 101, maxLength: 150 },
  )
  .map((chars) => chars.join(''));

// Generator: valid names (1-100 chars after trim, not whitespace-only)
const validNameArb = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split(''),
    ),
    { minLength: 1, maxLength: 100 },
  )
  .map((chars) => chars.join(''))
  .filter((s) => s.trim().length >= 1 && s.trim().length <= 100);

describe('Feature: categories-crud, Property 2: Name validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('createCategory rejects empty strings with 422', async () => {
    await fc.assert(
      fc.asyncProperty(emptyStringArb, async (name) => {
        vi.clearAllMocks();

        const req = mockRequest({ name });
        const res = mockResponse();

        await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('createCategory rejects whitespace-only strings with 422', async () => {
    await fc.assert(
      fc.asyncProperty(whitespaceOnlyArb, async (name) => {
        vi.clearAllMocks();

        const req = mockRequest({ name });
        const res = mockResponse();

        await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('createCategory rejects strings > 100 chars after trim with 422', async () => {
    await fc.assert(
      fc.asyncProperty(tooLongAfterTrimArb, async (name) => {
        vi.clearAllMocks();

        const req = mockRequest({ name });
        const res = mockResponse();

        await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('createCategory does NOT return 422 for valid names (1-100 chars after trim)', async () => {
    await fc.assert(
      fc.asyncProperty(validNameArb, async (name) => {
        vi.clearAllMocks();

        // Mock: no duplicate found
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        } as never);

        // Mock: max sort_order query
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ max_sort_order: 0 }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        // Mock: insert result
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{
            id: 'new-id',
            name: name.trim(),
            sort_order: 1,
            status: 'ativo',
            created_at: '2024-01-01T00:00:00.000Z',
          }],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest({ name });
        const res = mockResponse();

        await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

        // Valid names should NOT receive 422
        expect(res.statusCode).not.toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('updateCategory rejects empty strings with 422', async () => {
    await fc.assert(
      fc.asyncProperty(emptyStringArb, async (name) => {
        vi.clearAllMocks();

        const req = mockRequest({ name }, { id: '00000000-0000-0000-0000-000000000001' });
        const res = mockResponse();

        await invokeHandler(updateCategory, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('updateCategory rejects whitespace-only strings with 422', async () => {
    await fc.assert(
      fc.asyncProperty(whitespaceOnlyArb, async (name) => {
        vi.clearAllMocks();

        const req = mockRequest({ name }, { id: '00000000-0000-0000-0000-000000000001' });
        const res = mockResponse();

        await invokeHandler(updateCategory, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('updateCategory rejects strings > 100 chars after trim with 422', async () => {
    await fc.assert(
      fc.asyncProperty(tooLongAfterTrimArb, async (name) => {
        vi.clearAllMocks();

        const req = mockRequest({ name }, { id: '00000000-0000-0000-0000-000000000001' });
        const res = mockResponse();

        await invokeHandler(updateCategory, req as AuthenticatedRequest, res as unknown as Response);

        expect(res.statusCode).toBe(422);
      }),
      { numRuns: 100 },
    );
  });

  it('updateCategory does NOT return 422 for valid names (1-100 chars after trim)', async () => {
    await fc.assert(
      fc.asyncProperty(validNameArb, async (name) => {
        vi.clearAllMocks();

        const categoryId = '00000000-0000-0000-0000-000000000001';

        // Mock: category exists
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{ id: categoryId, name: 'Old Name', sort_order: 0, created_at: '2024-01-01T00:00:00.000Z' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        // Mock: no duplicate found
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [],
          command: 'SELECT',
          rowCount: 0,
          oid: 0,
          fields: [],
        } as never);

        // Mock: update result
        vi.mocked(pool.query).mockResolvedValueOnce({
          rows: [{
            id: categoryId,
            name: name.trim(),
            sort_order: 0,
            created_at: '2024-01-01T00:00:00.000Z',
          }],
          command: 'UPDATE',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = mockRequest({ name }, { id: categoryId });
        const res = mockResponse();

        await invokeHandler(updateCategory, req as AuthenticatedRequest, res as unknown as Response);

        // Valid names should NOT receive 422
        expect(res.statusCode).not.toBe(422);
      }),
      { numRuns: 100 },
    );
  });
});
