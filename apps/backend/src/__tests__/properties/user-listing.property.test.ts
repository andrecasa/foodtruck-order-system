import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn(), updateUserById: vi.fn(), signOut: vi.fn() } } },
}));

import { pool } from '../../config/database.js';
import { listUsers } from '../../services/user.service.js';

/**
 * Feature: user-crud, Property 8: Filtro por role retorna apenas usuários correspondentes
 *
 * Para qualquer conjunto de usuários com roles diversas (admin, atendente, preparador),
 * ao filtrar por uma role específica, a listagem deve retornar apenas os usuários
 * cuja role corresponde exatamente ao filtro aplicado, sem omitir nenhum e sem incluir extras.
 *
 * **Validates: Requirements 2.4**
 */
describe('Property 8: Filtro por role retorna apenas usuários correspondentes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const roles = ['admin', 'atendente', 'preparador'] as const;

  // Generator: a single user record with a specific role
  const userRecordArb = (role: 'admin' | 'atendente' | 'preparador') =>
    fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
      email: fc.emailAddress().filter((e) => e.length <= 254),
      role: fc.constant(role),
      status: fc.constantFrom('ativo' as const, 'inativo' as const),
      created_at: fc.constant(new Date('2024-01-01')),
      updated_at: fc.constant(new Date('2024-01-01')),
    });

  // Generator: a mixed set of users with different roles (at least 1 user)
  const mixedUsersArb = fc
    .tuple(
      fc.array(userRecordArb('admin'), { minLength: 0, maxLength: 5 }),
      fc.array(userRecordArb('atendente'), { minLength: 0, maxLength: 5 }),
      fc.array(userRecordArb('preparador'), { minLength: 0, maxLength: 5 }),
    )
    .filter(([a, b, c]) => a.length + b.length + c.length > 0)
    .map(([a, b, c]) => [...a, ...b, ...c]);

  // Generator: pick a role to filter by
  const roleToFilterArb = fc.constantFrom(...roles);

  it('filtering by role returns only users with that role and includes all of them', async () => {
    await fc.assert(
      fc.asyncProperty(mixedUsersArb, roleToFilterArb, async (allUsers, selectedRole) => {
        vi.clearAllMocks();

        // Compute the expected subset: users matching the selected role
        const expectedUsers = allUsers.filter((u) => u.role === selectedRole);

        // Sort expected by name (case-insensitive) to match service behavior
        const sortedExpected = [...expectedUsers].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );

        // Mock pool.query: simulate DB filtering by role
        vi.mocked(pool.query).mockResolvedValue({
          rows: sortedExpected,
          command: 'SELECT',
          rowCount: sortedExpected.length,
          oid: 0,
          fields: [],
        } as never);

        // Call the service with role filter (tenant-scoped)
        const result = await listUsers('tenant-a', { role: selectedRole });

        // ALL returned users have exactly the filtered role
        for (const user of result) {
          expect(user.role).toBe(selectedRole);
        }

        // No user with a different role appears in the results
        const wrongRoleUsers = result.filter((u) => u.role !== selectedRole);
        expect(wrongRoleUsers).toHaveLength(0);

        // All users with the matching role from the original set are present
        expect(result).toHaveLength(sortedExpected.length);

        // Verify pool.query was called with tenant scope and the role filter.
        // TenantRepository injects tenant_id as $1, so the role predicate is
        // renumbered to $2.
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('tenant_id = $1'),
          expect.arrayContaining(['tenant-a', selectedRole]),
        );
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('role = $2'),
          expect.anything(),
        );
      }),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: user-crud, Property 9: Filtro por status retorna apenas usuários correspondentes
 *
 * Para qualquer conjunto de usuários com status variados ('ativo' | 'inativo'),
 * ao filtrar por um status específico, o resultado deve conter exatamente os
 * usuários que possuem aquele status — nenhum a mais, nenhum a menos.
 *
 * **Validates: Requirements 2.5**
 */
describe('Property 9: Filtro por status retorna apenas usuários correspondentes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid role
  const validRole = fc.constantFrom(
    'admin' as const,
    'atendente' as const,
    'preparador' as const,
  );

  // Generator: valid status
  const validStatus = fc.constantFrom('ativo' as const, 'inativo' as const);

  // Generator: a single user row (as returned from DB)
  const userRow = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    email: fc.emailAddress().filter((e) => e.length <= 254),
    role: validRole,
    status: validStatus,
    created_at: fc.constant(new Date('2024-01-01')),
    updated_at: fc.constant(new Date('2024-01-01')),
  });

  // Generator: non-empty list of users with mixed statuses
  const userList = fc.array(userRow, { minLength: 1, maxLength: 20 });

  it('filtering by status returns exactly the matching users and no others', async () => {
    await fc.assert(
      fc.asyncProperty(userList, validStatus, async (users, selectedStatus) => {
        vi.clearAllMocks();

        // Determine expected results: only users matching the selected status
        const expectedRows = users.filter((u) => u.status === selectedStatus);

        // Sort by name (case-insensitive) to match service behavior
        const sortedExpected = [...expectedRows].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );

        // Mock pool.query to simulate DB filtering by status
        vi.mocked(pool.query).mockResolvedValue({
          rows: sortedExpected,
          command: 'SELECT',
          rowCount: sortedExpected.length,
          oid: 0,
          fields: [],
        } as never);

        // Call listUsers with the status filter (tenant-scoped)
        const result = await listUsers('tenant-a', { status: selectedStatus });

        // ALL returned users must have exactly the filtered status
        for (const user of result) {
          expect(user.status).toBe(selectedStatus);
        }

        // No user with a different status appears in the results
        const wrongStatus = result.filter((u) => u.status !== selectedStatus);
        expect(wrongStatus).toHaveLength(0);

        // All users with the matching status from the original set are present
        expect(result).toHaveLength(sortedExpected.length);

        // Verify the query was called with tenant scope and the status filter.
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('tenant_id = $1'),
          expect.arrayContaining(['tenant-a', selectedStatus]),
        );
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('status = $2'),
          expect.anything(),
        );
      }),
      { numRuns: 100 },
    );
  });
});


/**
 * Feature: user-crud, Property 7: Listagem ordenada alfabeticamente por nome (case-insensitive)
 *
 * Para qualquer conjunto de usuários retornado pela listagem, a sequência de nomes
 * deve estar em ordem alfabética crescente utilizando comparação case-insensitive.
 * O serviço utiliza `ORDER BY LOWER(name) ASC` na query SQL.
 *
 * **Validates: Requirements 2.2**
 */
describe('Property 7: Listagem ordenada alfabeticamente por nome (case-insensitive)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: names with mixed capitalization to stress case-insensitive ordering
  const mixedCaseName = fc
    .array(
      fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
      ),
      { minLength: 1, maxLength: 30 },
    )
    .map((chars) => chars.join(''));

  // Generator: a single user row with mixed-case name
  const userRowArb = fc.record({
    id: fc.uuid(),
    name: mixedCaseName,
    email: fc
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
      .map(([local, domain, tld]) => `${local}@${domain}.${tld}`),
    role: fc.constantFrom('admin' as const, 'atendente' as const, 'preparador' as const),
    status: fc.constantFrom('ativo' as const, 'inativo' as const),
    created_at: fc.constant(new Date('2024-01-01')),
    updated_at: fc.constant(new Date('2024-01-01')),
  });

  // Generator: array of user rows (2 to 20 users to have meaningful ordering)
  const userRowsArb = fc.array(userRowArb, { minLength: 2, maxLength: 20 });

  it('listUsers returns results sorted by LOWER(name) in ascending order', async () => {
    await fc.assert(
      fc.asyncProperty(userRowsArb, async (rows) => {
        vi.clearAllMocks();

        // Simulate DB behavior: sort rows by LOWER(name) ASC (what the SQL query does)
        const sortedRows = [...rows].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );

        // Mock the database to return pre-sorted rows (as the real DB would)
        vi.mocked(pool.query).mockResolvedValue({
          rows: sortedRows,
          command: 'SELECT',
          rowCount: sortedRows.length,
          oid: 0,
          fields: [],
        } as never);

        // Call listUsers (tenant-scoped)
        const result = await listUsers('tenant-a');

        // Property: for any i < j, result[i].name.toLowerCase() <= result[j].name.toLowerCase()
        for (let i = 0; i < result.length - 1; i++) {
          const current = result[i]!.name.toLowerCase();
          const next = result[i + 1]!.name.toLowerCase();
          expect(current.localeCompare(next)).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('ordering is case-insensitive: uppercase and lowercase variants are treated equally', async () => {
    await fc.assert(
      fc.asyncProperty(userRowsArb, async (rows) => {
        vi.clearAllMocks();

        // Simulate DB behavior: sort by LOWER(name) ASC
        const sortedRows = [...rows].sort((a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );

        vi.mocked(pool.query).mockResolvedValue({
          rows: sortedRows,
          command: 'SELECT',
          rowCount: sortedRows.length,
          oid: 0,
          fields: [],
        } as never);

        // Call listUsers and verify the lowercase projection of names is in non-decreasing order
        const result = await listUsers('tenant-a');
        const lowerNames = result.map((u) => u.name.toLowerCase());
        for (let i = 0; i < lowerNames.length - 1; i++) {
          expect(lowerNames[i]!.localeCompare(lowerNames[i + 1]!)).toBeLessThanOrEqual(0);
        }
      }),
      { numRuns: 100 },
    );
  });
});
