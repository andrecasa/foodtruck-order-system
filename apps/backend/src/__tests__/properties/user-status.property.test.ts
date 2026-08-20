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
import { deactivateUser, activateUser, ServiceError } from '../../services/user.service.js';
import { adminMiddleware } from '../../middleware/role.middleware.js';

/**
 * Feature: user-crud, Property 12: Round-trip desativação/reativação restaura status ativo
 *
 * Para qualquer usuário com status 'ativo', ao desativá-lo e em seguida reativá-lo,
 * o registro resultante deve ter status 'ativo' idêntico ao original (exceto updated_at).
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 12: Round-trip desativação/reativação restaura status ativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID for user IDs
  const userIdArb = fc.uuid();

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

  it('deactivating then reactivating a user restores status to ativo', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        validNameArb,
        validEmailArb,
        validRoleArb,
        async (userId, requesterId, name, email, role) => {
          // Ensure requester is different from target to avoid self-deactivation error
          if (userId === requesterId) return;

          vi.clearAllMocks();

          const originalUser = {
            id: userId,
            name,
            email,
            role,
            status: 'ativo',
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
          };

          const deactivatedUser = {
            ...originalUser,
            status: 'inativo',
            updated_at: new Date('2024-06-01'),
          };

          const reactivatedUser = {
            ...originalUser,
            status: 'ativo',
            updated_at: new Date('2024-07-01'),
          };

          let phase: 'deactivate' | 'activate' = 'deactivate';
          // Whether the UPDATE for the current phase has run, so the re-fetch
          // (findOne after update) returns the post-update row.
          let updatedInPhase = false;

          // Mock TenantRepository SQL shapes for both phases.
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // Admin guard (deactivate path): return >1 active admin to allow it.
            if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
              return {
                rows: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a5' }],
                command: 'SELECT',
                rowCount: 5,
                oid: 0,
                fields: [],
              } as never;
            }

            if (phase === 'deactivate') {
              if (typeof sql === 'string' && sql.includes('UPDATE users SET')) {
                updatedInPhase = true;
                return {
                  rows: [deactivatedUser],
                  command: 'UPDATE',
                  rowCount: 1,
                  oid: 0,
                  fields: [],
                } as never;
              }
              // findOne user: active before update, inactive after.
              if (typeof sql === 'string' && sql.includes('SELECT * FROM users')) {
                return {
                  rows: [updatedInPhase ? deactivatedUser : originalUser],
                  command: 'SELECT',
                  rowCount: 1,
                  oid: 0,
                  fields: [],
                } as never;
              }
            } else {
              // phase === 'activate'
              if (typeof sql === 'string' && sql.includes('UPDATE users SET')) {
                updatedInPhase = true;
                return {
                  rows: [reactivatedUser],
                  command: 'UPDATE',
                  rowCount: 1,
                  oid: 0,
                  fields: [],
                } as never;
              }
              // findOne user: inactive before update, active after.
              if (typeof sql === 'string' && sql.includes('SELECT * FROM users')) {
                return {
                  rows: [updatedInPhase ? reactivatedUser : deactivatedUser],
                  command: 'SELECT',
                  rowCount: 1,
                  oid: 0,
                  fields: [],
                } as never;
              }
            }

            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Mock Supabase signOut (called during deactivation)
          vi.mocked(supabaseAdmin.auth.admin.signOut).mockResolvedValue({
            error: null,
          } as never);

          // Phase 1: Deactivate the user (tenant-scoped)
          phase = 'deactivate';
          updatedInPhase = false;
          const afterDeactivation = await deactivateUser('tenant-a', userId, requesterId);
          expect(afterDeactivation.status).toBe('inativo');

          // Phase 2: Reactivate the user (tenant-scoped)
          phase = 'activate';
          updatedInPhase = false;
          const afterReactivation = await activateUser('tenant-a', userId);

          // Verify round-trip: status is back to ativo
          expect(afterReactivation.status).toBe('ativo');

          // Verify other fields are preserved (except updated_at)
          expect(afterReactivation.id).toBe(originalUser.id);
          expect(afterReactivation.name).toBe(originalUser.name);
          expect(afterReactivation.email).toBe(originalUser.email);
          expect(afterReactivation.role).toBe(originalUser.role);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: user-crud, Property 13: Usuário inativo não pode autenticar
 *
 * Para qualquer usuário com status 'inativo' (independente da role),
 * o adminMiddleware deve rejeitar com HTTP 403 e a mensagem
 * "Usuário desativado. Contate o administrador.", e next() nunca deve ser chamado.
 *
 * **Validates: Requirements 4.3**
 */
describe('Property 13: Usuário inativo não pode autenticar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  // Generator: any role (inactive users are blocked regardless of role)
  const anyRole = fc.constantFrom('admin' as const, 'atendente' as const, 'preparador' as const);

  it('inactive users always receive HTTP 403 with correct error message regardless of role', async () => {
    await fc.assert(
      fc.asyncProperty(
        userId,
        userEmail,
        anyRole,
        async (id, email, role) => {
          vi.clearAllMocks();

          // Mock pool.query to return an inactive user
          vi.mocked(pool.query).mockResolvedValue({
            rows: [{ role, status: 'inativo' }],
            command: 'SELECT',
            rowCount: 1,
            oid: 0,
            fields: [],
          } as never);

          // Create mock Express req/res/next
          const req = {
            user: { id, email },
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

          // Property: response body has correct error structure for inactive user
          expect(jsonFn).toHaveBeenCalledWith({
            statusCode: 403,
            error: 'FORBIDDEN',
            message: 'Usuário desativado. Contate o administrador.',
          });

          // Property: next() must NOT be called (request is blocked)
          expect(next).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
