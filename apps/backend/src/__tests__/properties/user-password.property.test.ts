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
import { resetPassword } from '../../services/user.service.js';
import { resetPasswordSchema } from '../../validation/user.validation.js';

/**
 * Feature: user-crud, Property 16: Reset de senha aceita qualquer senha de comprimento válido
 *
 * Para qualquer string com comprimento entre 8 e 72 caracteres (inclusive),
 * resetPassword deve ser processado com sucesso quando o usuário existe e
 * o Supabase Auth responde com sucesso.
 *
 * **Validates: Requirements 7.1**
 */
describe('Property 16: Reset de senha aceita qualquer senha de comprimento válido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid password with letters, numbers, and special characters (8–72 chars)
  const validPasswordArb = fc.string({
    minLength: 8,
    maxLength: 72,
    unit: fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?'.split(''),
    ),
  });

  it('resetPassword succeeds for any password with valid length (8–72 chars)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        validPasswordArb,
        async (id, password) => {
          vi.clearAllMocks();

          // Mock: user exists
          vi.mocked(pool.query).mockResolvedValue({
            rows: [{ id }],
            command: 'SELECT',
            rowCount: 1,
            oid: 0,
            fields: [],
          } as never);

          // Mock: Supabase Auth updateUserById succeeds
          vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({
            data: { user: {} },
            error: null,
          } as never);

          // Mock: Supabase Auth signOut succeeds
          vi.mocked(supabaseAdmin.auth.admin.signOut).mockResolvedValue({
            error: null,
          } as never);

          // resetPassword must resolve without error
          await expect(resetPassword(id, password)).resolves.toBeUndefined();

          // Verify updateUserById was called with correct id and password
          expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(id, {
            password,
          });

          // Verify signOut was called with id and 'global'
          expect(supabaseAdmin.auth.admin.signOut).toHaveBeenCalledWith(id, 'global');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('resetPasswordSchema rejects passwords outside valid range (< 8 or > 72)', () => {
    // Generator: password too short (0–7 chars)
    const tooShortArb = fc.string({
      minLength: 0,
      maxLength: 7,
      unit: fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
      ),
    });

    // Generator: password too long (73–150 chars)
    const tooLongArb = fc.string({
      minLength: 73,
      maxLength: 150,
      unit: fc.constantFrom(
        ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),
      ),
    });

    fc.assert(
      fc.property(
        fc.oneof(tooShortArb, tooLongArb),
        (password) => {
          const result = resetPasswordSchema.safeParse({ password });
          expect(result.success).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
