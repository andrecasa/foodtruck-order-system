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
import { updateUser, deactivateUser, deleteUser, ServiceError } from '../../services/user.service.js';

/**
 * Feature: user-crud, Property 10: Atualização modifica apenas os campos fornecidos
 *
 * Para qualquer conjunto parcial de campos válidos (nome, email, role) enviados
 * na atualização, apenas esses campos devem ser alterados no registro; os demais
 * campos devem permanecer inalterados.
 *
 * **Validates: Requirements 3.1**
 */
describe('Property 10: Atualização modifica apenas os campos fornecidos', () => {
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

  // Generator: non-empty subset of update fields
  const updateFieldsSubset = fc.subarray(['name', 'email', 'role'] as const, { minLength: 1 });

  // Generator: a "current user" record in the DB
  const currentUserArb = fc.record({
    id: userIdArb,
    name: validNameArb,
    email: validEmailArb,
    role: validRoleArb,
    status: fc.constant('ativo' as const),
    created_at: fc.constant(new Date('2024-01-01')),
    updated_at: fc.constant(new Date('2024-01-01')),
  });

  // Generator: new values for update
  const newValuesArb = fc.record({
    name: validNameArb,
    email: validEmailArb,
    role: validRoleArb,
  });

  it('only the fields included in the update input are changed; others remain unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        currentUserArb,
        newValuesArb,
        updateFieldsSubset,
        requesterIdArb,
        async (currentUser, newValues, fieldsToUpdate, requesterId) => {
          vi.clearAllMocks();

          // Build the update input with only the selected fields
          const updateInput: Record<string, string> = {};
          for (const field of fieldsToUpdate) {
            updateInput[field] = newValues[field];
          }

          // Compute expected updated user row (as DB would return)
          const updatedRow = {
            ...currentUser,
            ...(updateInput.name !== undefined ? { name: updateInput.name } : {}),
            ...(updateInput.email !== undefined ? { email: updateInput.email.toLowerCase() } : {}),
            ...(updateInput.role !== undefined ? { role: updateInput.role } : {}),
            updated_at: new Date('2024-06-01'),
          };

          // Track whether the UPDATE has already run so the post-update
          // re-fetch (findOne) returns the updated row.
          let updated = false;

          // Mock pool.query against the TenantRepository SQL shapes. The repo
          // always emits `... FROM users WHERE tenant_id = $1 AND (...)`.
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // UPDATE RETURNING
            if (typeof sql === 'string' && sql.includes('UPDATE users SET')) {
              updated = true;
              return {
                rows: [updatedRow],
                command: 'UPDATE',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }

            // Email uniqueness check (scoped): LOWER(email) ... AND id !=
            if (typeof sql === 'string' && sql.includes('LOWER(email)') && sql.includes('id !=')) {
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            }

            // Admin guard: SELECT of active admins (repo.select on users).
            if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
              // Multiple admins so a role change away from admin is allowed.
              return {
                rows: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }, { id: 'a5' }],
                command: 'SELECT',
                rowCount: 5,
                oid: 0,
                fields: [],
              } as never;
            }

            // findOne current/updated user: SELECT * FROM users WHERE tenant_id ...
            if (typeof sql === 'string' && sql.includes('SELECT * FROM users')) {
              return {
                rows: [updated ? updatedRow : currentUser],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }

            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Mock Supabase Auth operations (for email/role changes)
          vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({
            data: { user: {} },
            error: null,
          } as never);
          vi.mocked(supabaseAdmin.auth.admin.signOut).mockResolvedValue({
            error: null,
          } as never);

          // Call updateUser (tenant-scoped)
          const result = await updateUser('tenant-a', currentUser.id, updateInput, requesterId);

          // Verify: fields that WERE in the update have their new values
          if (fieldsToUpdate.includes('name')) {
            expect(result.name).toBe(updateInput.name);
          }
          if (fieldsToUpdate.includes('email')) {
            expect(result.email).toBe(updateInput.email!.toLowerCase());
          }
          if (fieldsToUpdate.includes('role')) {
            expect(result.role).toBe(updateInput.role);
          }

          // Verify: fields that were NOT in the update retain their original values
          if (!fieldsToUpdate.includes('name')) {
            expect(result.name).toBe(currentUser.name);
          }
          if (!fieldsToUpdate.includes('email')) {
            expect(result.email).toBe(currentUser.email);
          }
          if (!fieldsToUpdate.includes('role')) {
            expect(result.role).toBe(currentUser.role);
          }

          // Verify: status is NEVER changed by updateUser
          expect(result.status).toBe(currentUser.status);
        },
      ),
      { numRuns: 100 },
    );
  });
});

/**
 * Feature: user-crud, Property 11: Invariante de pelo menos um admin ativo
 *
 * Para qualquer operação que resultaria na ausência de usuários com role `admin`
 * e status `ativo` no sistema (alteração de role, desativação ou exclusão do último
 * admin ativo), o sistema deve rejeitar a operação.
 *
 * **Validates: Requirements 3.5, 4.4, 5.2**
 */
describe('Property 11: Invariante de pelo menos um admin ativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID for user IDs
  const userIdArb = fc.uuid();

  // Generator: a requester ID that is different from the target user
  const requesterIdArb = fc.uuid();

  // Generator: non-admin roles to change to
  const nonAdminRoleArb = fc.constantFrom('atendente' as const, 'preparador' as const);

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

  it('updateUser rejects changing the last active admin role to a non-admin role', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        requesterIdArb,
        nonAdminRoleArb,
        validNameArb,
        validEmailArb,
        async (userId, requesterId, newRole, name, email) => {
          vi.clearAllMocks();

          // Mock TenantRepository SQL shapes.
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // Admin guard: single active admin (this is the last one).
            if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
              return {
                rows: [{ id: userId }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // findOne current user (role='admin', status='ativo').
            if (typeof sql === 'string' && sql.includes('SELECT * FROM users')) {
              return {
                rows: [{
                  id: userId,
                  name,
                  email,
                  role: 'admin',
                  status: 'ativo',
                  created_at: new Date('2024-01-01'),
                  updated_at: new Date('2024-01-01'),
                }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Attempting to change the last admin's role must be rejected
          await expect(
            updateUser('tenant-a', userId, { role: newRole }, requesterId),
          ).rejects.toThrow(ServiceError);

          try {
            await updateUser('tenant-a', userId, { role: newRole }, requesterId);
          } catch (err) {
            expect(err).toBeInstanceOf(ServiceError);
            expect((err as ServiceError).statusCode).toBe(422);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deactivateUser rejects deactivating the last active admin', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        requesterIdArb,
        validNameArb,
        validEmailArb,
        async (userId, requesterId, name, email) => {
          // Ensure requester is different from target to avoid self-deactivation error
          if (userId === requesterId) return;

          vi.clearAllMocks();

          // Mock TenantRepository SQL shapes.
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // Admin guard: single active admin (last one).
            if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
              return {
                rows: [{ id: userId }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // findOne user (admin, ativo).
            if (typeof sql === 'string' && sql.includes('SELECT * FROM users')) {
              return {
                rows: [{
                  id: userId,
                  name,
                  email,
                  role: 'admin',
                  status: 'ativo',
                  created_at: new Date('2024-01-01'),
                  updated_at: new Date('2024-01-01'),
                }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Attempting to deactivate the last admin must be rejected
          await expect(
            deactivateUser('tenant-a', userId, requesterId),
          ).rejects.toThrow(ServiceError);

          try {
            await deactivateUser('tenant-a', userId, requesterId);
          } catch (err) {
            expect(err).toBeInstanceOf(ServiceError);
            expect((err as ServiceError).statusCode).toBe(422);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('deleteUser rejects deleting the last active admin', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        requesterIdArb,
        validNameArb,
        validEmailArb,
        async (userId, requesterId, name, email) => {
          // Ensure requester is different from target to avoid self-deletion error
          if (userId === requesterId) return;

          vi.clearAllMocks();

          // Mock TenantRepository SQL shapes.
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            // Orders lookup (scoped select on orders): no orders.
            if (typeof sql === 'string' && sql.includes('FROM orders')) {
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            }
            // Admin guard: single active admin (last one).
            if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
              return {
                rows: [{ id: userId }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // findOne user (admin, ativo).
            if (typeof sql === 'string' && sql.includes('SELECT * FROM users')) {
              return {
                rows: [{
                  id: userId,
                  name,
                  email,
                  role: 'admin',
                  status: 'ativo',
                  created_at: new Date('2024-01-01'),
                  updated_at: new Date('2024-01-01'),
                }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
          });

          // Attempting to delete the last admin must be rejected
          await expect(
            deleteUser('tenant-a', userId, requesterId),
          ).rejects.toThrow(ServiceError);

          try {
            await deleteUser('tenant-a', userId, requesterId);
          } catch (err) {
            expect(err).toBeInstanceOf(ServiceError);
            expect((err as ServiceError).statusCode).toBe(422);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
