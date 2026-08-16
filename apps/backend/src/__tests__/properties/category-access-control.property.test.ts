import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../../config/database.js';
import { adminMiddleware } from '../../middleware/role.middleware.js';

/**
 * Feature: categories-crud, Property 10: Access control
 *
 * For any authenticated user with role 'atendente' or 'preparador', any request to any
 * category management endpoint (list, create, update, reorder, toggle status, delete)
 * SHALL be rejected with HTTP 403.
 *
 * **Validates: Requirements 7.1**
 */
describe('Feature: categories-crud, Property 10: Access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: non-admin roles
  const nonAdminRole = fc.constantFrom('atendente' as const, 'preparador' as const);

  // Generator: valid UUID for user id
  const userId = fc.uuid();

  // Generator: valid email
  const userEmail = fc
    .tuple(
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 15,
      }).map((chars) => chars.join('')),
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 10,
      }).map((chars) => chars.join('')),
      fc.constantFrom('com', 'org', 'net', 'io'),
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

  // Generator: category management endpoint paths
  const categoryEndpoint = fc.constantFrom(
    '/api/categories',
    '/api/categories/some-id',
    '/api/categories/reorder',
    '/api/categories/some-id/status',
  );

  // Generator: HTTP methods used in category management endpoints
  const httpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

  it('non-admin users always receive HTTP 403 on category management endpoints', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRole,
        userId,
        userEmail,
        categoryEndpoint,
        httpMethod,
        async (role, id, email, path, method) => {
          vi.clearAllMocks();

          // Mock pool.query to return a non-admin active user
          vi.mocked(pool.query).mockResolvedValue({
            rows: [{ role, status: 'ativo' }],
            command: 'SELECT',
            rowCount: 1,
            oid: 0,
            fields: [],
          } as never);

          const req = {
            user: { id, email },
            path,
            method,
          } as never;

          const statusFn = vi.fn().mockReturnThis();
          const jsonFn = vi.fn().mockReturnThis();
          const res = {
            status: statusFn,
            json: jsonFn,
          } as never;

          const next = vi.fn();

          await adminMiddleware(req, res, next);

          // Property: response status must be 403
          expect(statusFn).toHaveBeenCalledWith(403);

          // Property: response body has correct error structure
          expect(jsonFn).toHaveBeenCalledWith({
            statusCode: 403,
            error: 'FORBIDDEN',
            message: 'Acesso restrito a administradores.',
          });

          // Property: next() must NOT be called (request is blocked)
          expect(next).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('admin users are allowed through the middleware (next() is called)', async () => {
    await fc.assert(
      fc.asyncProperty(userId, userEmail, categoryEndpoint, httpMethod, async (id, email, path, method) => {
        vi.clearAllMocks();

        // Mock pool.query to return an admin active user
        vi.mocked(pool.query).mockResolvedValue({
          rows: [{ role: 'admin', status: 'ativo' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = {
          user: { id, email },
          path,
          method,
        } as never;

        const statusFn = vi.fn().mockReturnThis();
        const jsonFn = vi.fn().mockReturnThis();
        const res = {
          status: statusFn,
          json: jsonFn,
        } as never;

        const next = vi.fn();

        await adminMiddleware(req, res, next);

        // Property: next() MUST be called for admin users
        expect(next).toHaveBeenCalled();

        // Property: no error response sent
        expect(statusFn).not.toHaveBeenCalled();
        expect(jsonFn).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
