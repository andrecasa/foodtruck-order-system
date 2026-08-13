import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn(),
        updateUserById: vi.fn(),
        signOut: vi.fn(),
      },
    },
  },
}));

import { pool } from '../../config/database.js';
import { supabaseAdmin } from '../../config/supabase.js';
import { deleteUser, ServiceError } from '../../services/user.service.js';

/**
 * Feature: user-crud, Property 14: Exclusão remove usuário completamente
 *
 * Para qualquer usuário sem pedidos associados, após exclusão bem-sucedida,
 * deleteUser completa sem erro, e tanto supabaseAdmin.auth.admin.deleteUser
 * quanto pool.query DELETE são chamados.
 *
 * **Validates: Requirements 5.1**
 */
describe('Property 14: Exclusão remove usuário completamente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID for user IDs
  const userIdArb = fc.uuid();
  const requesterIdArb = fc.uuid();

  // Generator: valid user name
  const validNameArb = fc
    .array(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ '.split(''),
      ),
      { minLength: 1, maxLength: 50 },
    )
    .map((chars) => chars.join(''))
    .filter((s) => s.trim().length > 0);

  // Generator: valid email
  const validEmailArb = fc
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

  // Generator: valid role
  const validRoleArb = fc.constantFrom('admin' as const, 'atendente' as const, 'preparador' as const);

  // Generator: valid status
  const validStatusArb = fc.constantFrom('ativo' as const, 'inativo' as const);

  it('deleteUser completes without error and calls both Supabase deleteUser and DB DELETE for users without orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        requesterIdArb,
        validNameArb,
        validEmailArb,
        validRoleArb,
        validStatusArb,
        async (userId, requesterId, name, email, role, status) => {
          // Ensure requester is different from target to avoid self-deletion block
          if (userId === requesterId) return;

          vi.clearAllMocks();

          const user = {
            id: userId,
            name,
            email,
            role,
            status,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          };

          // Mock pool.query
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // SELECT user by id
            if (typeof sql === 'string' && sql.includes('SELECT *') && sql.includes('WHERE id')) {
              return {
                rows: [user],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // COUNT active admins (return >1 so it doesn't block)
            if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('admin')) {
              return {
                rows: [{ count: '5' }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // COUNT orders - return 0 (no orders)
            if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('orders')) {
              return {
                rows: [{ count: '0' }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // DELETE from users
            if (typeof sql === 'string' && sql.includes('DELETE')) {
              return {
                rows: [],
                command: 'DELETE',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Mock Supabase Auth deleteUser - success
          vi.mocked(supabaseAdmin.auth.admin.deleteUser).mockResolvedValue({
            data: { user: {} },
            error: null,
          } as never);

          // Call deleteUser - should complete without error
          await expect(deleteUser(userId, requesterId)).resolves.toBeUndefined();

          // Verify: supabaseAdmin.auth.admin.deleteUser was called with userId
          expect(supabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(userId);

          // Verify: pool.query was called with DELETE
          const deleteCalls = vi.mocked(pool.query).mock.calls.filter(
            (call) => typeof call[0] === 'string' && call[0].includes('DELETE'),
          );
          expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: user-crud, Property 15: Usuários com pedidos não podem ser excluídos
 *
 * Para qualquer usuário que possui ao menos um pedido associado (orderCount > 0),
 * deleteUser deve rejeitar com ServiceError tendo statusCode 422 e a exclusão
 * não deve prosseguir (Supabase Auth deleteUser não é chamado).
 *
 * **Validates: Requirements 5.5**
 */
describe('Property 15: Usuários com pedidos não podem ser excluídos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID for user IDs
  const userIdArb = fc.uuid();
  const requesterIdArb = fc.uuid();

  // Generator: valid user name
  const validNameArb = fc
    .array(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ '.split(''),
      ),
      { minLength: 1, maxLength: 50 },
    )
    .map((chars) => chars.join(''))
    .filter((s) => s.trim().length > 0);

  // Generator: valid email
  const validEmailArb = fc
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

  // Generator: valid role
  const validRoleArb = fc.constantFrom('admin' as const, 'atendente' as const, 'preparador' as const);

  // Generator: valid status
  const validStatusArb = fc.constantFrom('ativo' as const, 'inativo' as const);

  // Generator: positive order count (at least 1 order)
  const orderCountArb = fc.integer({ min: 1, max: 1000 });

  it('deleteUser rejects with ServiceError 422 when user has associated orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        requesterIdArb,
        validNameArb,
        validEmailArb,
        validRoleArb,
        validStatusArb,
        orderCountArb,
        async (userId, requesterId, name, email, role, status, orderCount) => {
          // Ensure requester is different from target to avoid self-deletion block
          if (userId === requesterId) return;

          vi.clearAllMocks();

          const user = {
            id: userId,
            name,
            email,
            role,
            status,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          };

          // Mock pool.query
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // SELECT user by id
            if (typeof sql === 'string' && sql.includes('SELECT *') && sql.includes('WHERE id')) {
              return {
                rows: [user],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // COUNT active admins (return >1 so it doesn't block on admin check)
            if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('admin')) {
              return {
                rows: [{ count: '5' }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // COUNT orders - return positive number (user has orders)
            if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('orders')) {
              return {
                rows: [{ count: String(orderCount) }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Call deleteUser - should reject with ServiceError 422
          await expect(deleteUser(userId, requesterId)).rejects.toThrow(ServiceError);

          try {
            await deleteUser(userId, requesterId);
          } catch (err) {
            expect(err).toBeInstanceOf(ServiceError);
            expect((err as ServiceError).statusCode).toBe(422);
          }

          // Verify: supabaseAdmin.auth.admin.deleteUser was NOT called (deletion didn't proceed)
          expect(supabaseAdmin.auth.admin.deleteUser).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
