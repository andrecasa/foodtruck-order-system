import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

import { pool } from '../../config/database.js';
import { adminMiddleware } from '../../middleware/role.middleware.js';

/**
 * Feature: user-crud, Property 4: Usuários não-admin são bloqueados em endpoints de gestão
 *
 * Para qualquer usuário autenticado com role 'atendente' ou 'preparador' e status 'ativo',
 * todas as requisições a endpoints de gestão de usuários devem ser rejeitadas com HTTP 403
 * e a mensagem "Acesso restrito a administradores.", e next() nunca deve ser chamado.
 *
 * **Validates: Requirements 1.8, 6.1**
 */
describe('Property 4: Usuários não-admin são bloqueados em endpoints de gestão', () => {
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

  // Generator: management endpoint paths
  const managementEndpoint = fc.constantFrom(
    '/api/users',
    '/api/users/create',
    '/api/users/some-id',
    '/api/users/some-id/status',
    '/api/users/some-id/reset-password',
  );

  // Generator: HTTP methods used in management endpoints
  const httpMethod = fc.constantFrom('GET', 'POST', 'PUT', 'PATCH', 'DELETE');

  it('non-admin users always receive HTTP 403 with correct error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonAdminRole,
        userId,
        userEmail,
        managementEndpoint,
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

          // Create mock Express req/res/next
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

          // Call adminMiddleware
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

  it('non-admin users are blocked regardless of their specific role', async () => {
    await fc.assert(
      fc.asyncProperty(nonAdminRole, userId, userEmail, async (role, id, email) => {
        vi.clearAllMocks();

        // Mock pool.query to return the non-admin user as active
        vi.mocked(pool.query).mockResolvedValue({
          rows: [{ role, status: 'ativo' }],
          command: 'SELECT',
          rowCount: 1,
          oid: 0,
          fields: [],
        } as never);

        const req = {
          user: { id, email },
          path: '/api/users',
          method: 'GET',
        } as never;

        const statusFn = vi.fn().mockReturnThis();
        const jsonFn = vi.fn().mockReturnThis();
        const res = {
          status: statusFn,
          json: jsonFn,
        } as never;

        const next = vi.fn();

        await adminMiddleware(req, res, next);

        // Property: both 'atendente' and 'preparador' are equally blocked
        expect(statusFn).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();

        // Verify the DB was queried with the correct user id
        expect(pool.query).toHaveBeenCalledWith(
          'SELECT role, status FROM users WHERE id = $1',
          [id],
        );
      }),
      { numRuns: 100 },
    );
  });
});
