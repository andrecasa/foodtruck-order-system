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

          let queryCallCount = 0;

          // Mock pool.query
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            queryCallCount++;

            // First call: SELECT current user
            if (typeof sql === 'string' && sql.includes('SELECT *') && sql.includes('WHERE id')) {
              return {
                rows: [currentUser],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }

            // Email uniqueness check
            if (typeof sql === 'string' && sql.includes('LOWER(email)') && sql.includes('id !=')) {
              return {
                rows: [],
                command: 'SELECT',
                rowCount: 0,
                oid: 0,
                fields: [],
              } as never;
            }

            // Admin count check (for role changes from admin)
            if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('admin')) {
              return {
                rows: [{ count: '5' }], // Multiple admins, so change is allowed
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }

            // UPDATE RETURNING
            if (typeof sql === 'string' && sql.includes('UPDATE users SET')) {
              return {
                rows: [updatedRow],
                command: 'UPDATE',
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

          // Call updateUser
          const result = await updateUser(currentUser.id, updateInput, requesterId);

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

          // Mock: user exists with role='admin' and status='ativo'
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('WHERE id')) {
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
            // Mock: admin count returns 1 (this is the last admin)
            if (typeof sql === 'string' && sql.includes('COUNT') && sql.includes('admin')) {
              return {
                rows: [{ count: '1' }],
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
            updateUser(userId, { role: newRole }, requesterId),
          ).rejects.toThrow(ServiceError);

          try {
            await updateUser(userId, { role: newRole }, requesterId);
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

          // Mock: user exists as admin with status='ativo'
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('WHERE id')) {
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
            // Mock: only 1 active admin in the system
            if (typeof sql === 'string' && sql.includes('COUNT')) {
              return {
                rows: [{ count: '1' }],
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
            deactivateUser(userId, requesterId),
          ).rejects.toThrow(ServiceError);

          try {
            await deactivateUser(userId, requesterId);
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

          // Mock: user exists as admin with status='ativo'
          vi.mocked(pool.query).mockImplementation(async (sql: string) => {
            if (typeof sql === 'string' && sql.includes('SELECT') && sql.includes('WHERE id')) {
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
            // Mock: only 1 active admin in the system
            if (typeof sql === 'string' && sql.includes('COUNT')) {
              return {
                rows: [{ count: '1' }],
                command: 'SELECT',
                rowCount: 1,
                oid: 0,
                fields: [],
              } as never;
            }
            // Mock: no orders associated (so delete proceeds to admin check)
            if (typeof sql === 'string' && sql.includes('orders')) {
              return {
                rows: [{ count: '0' }],
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
            deleteUser(userId, requesterId),
          ).rejects.toThrow(ServiceError);

          try {
            await deleteUser(userId, requesterId);
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
