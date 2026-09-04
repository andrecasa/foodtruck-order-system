import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// O serviço transitivamente carrega o cliente Supabase (requer credenciais no
// load) e o pool de banco. Mockamos ambos: este teste injeta um repositório e
// um cliente Supabase admin falsos via `deps`, então os módulos reais de infra
// não devem ser exercitados.
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn(), signOut: vi.fn() } } },
}));

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

/**
 * Feature: forgot-password, Property 7: Código é de uso único
 *
 * Para qualquer Codigo_Verificacao utilizado com sucesso para redefinir a
 * senha, ele deve ser marcado como utilizado e qualquer reuso posterior deve
 * ser recusado.
 *
 * **Validates: Requirements 3.7, 5.3, 6.3**
 *
 * Abordagem: exercitamos o serviço REAL `confirmReset`. Injetamos, via `deps`,
 * um repositório respaldado por um store em memória que honra `markUsed`
 * (define `used_at`) e `findActiveCodeForEmail` (um código com `used_at`
 * definido NÃO é mais retornado como ativo), além de um `supabaseAdmin` falso
 * que registra as atualizações de senha. Verificamos que:
 *   1. um código válido tem sucesso exatamente uma vez (chamando `markUsed`), e
 *   2. um segundo `confirmReset` com o MESMO código é recusado com
 *      `ServiceError` `INVALID_CODE`, sem atualizar a senha novamente.
 */

import {
  confirmReset,
  hashCode,
  ServiceError,
  type ConfirmResetDeps,
  type SupabaseAdminLike,
} from '../../services/password-reset.service.js';
import type {
  PasswordResetCodeRow,
  PasswordResetRepository,
} from '../../db/password-reset-repository.js';

// --- Geradores ----------------------------------------------------------------

const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.constantFrom('example.com', 'test.org', 'mail.dev', 'pastel.com.br'),
  )
  .map(([local, domain]) => `${local}@${domain}`);

// Código de 6 dígitos válido (com zeros à esquerda permitidos), coerente com
// o schema `^\d{6}$` exigido por `resetPasswordSchema`.
const codeArb = fc
  .integer({ min: 0, max: 999_999 })
  .map((n) => n.toString().padStart(6, '0'));

// Senha válida (8–72 caracteres), coerente com a política de senha.
const passwordArb = fc.string({ minLength: 8, maxLength: 72 });

// --- Test doubles -------------------------------------------------------------

/**
 * Repositório respaldado por um store em memória de um único código.
 * - `findActiveCodeForEmail`: retorna a linha apenas enquanto `used_at` é null
 *   (um código utilizado deixa de ser "ativo").
 * - `markUsed`: define `used_at`, tornando o código não mais ativo.
 * - `registerFailedAttempt`: incrementa `attempts` (não deve ser exercitado no
 *   caminho de sucesso, mas fica disponível).
 */
function buildInMemoryRepository(row: PasswordResetCodeRow, markUsedCalls: string[]): PasswordResetRepository {
  return {
    findUsersByEmail: async () => {
      throw new Error('not used in this property');
    },
    invalidateActiveCodes: async () => {},
    insertCode: async () => {
      throw new Error('not used in this property');
    },
    findActiveCodeForEmail: async () => {
      // Um código com `used_at` definido não é mais retornado como ativo.
      if (row.used_at !== null) {
        return null;
      }
      return { ...row };
    },
    registerFailedAttempt: async (codeId: string) => {
      if (codeId === row.id) {
        row.attempts += 1;
      }
      return { ...row };
    },
    markUsed: async (codeId: string) => {
      markUsedCalls.push(codeId);
      if (codeId === row.id) {
        row.used_at = new Date();
      }
    },
    invalidateCode: async () => {},
  };
}

/** Cliente Supabase admin falso: sucesso, registrando as senhas aplicadas. */
function buildFakeSupabaseAdmin(passwordUpdates: Array<{ id: string; password: string }>): SupabaseAdminLike {
  return {
    auth: {
      admin: {
        updateUserById: async (id, attributes) => {
          passwordUpdates.push({ id, password: attributes.password });
          return { error: null };
        },
        signOut: async () => undefined,
      },
    },
  };
}

// --- Tests --------------------------------------------------------------------

describe('Feature: forgot-password, Property 7: Código é de uso único', () => {
  it('um código válido tem sucesso uma vez e qualquer reuso é recusado com INVALID_CODE, sem nova atualização de senha', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        codeArb,
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        passwordArb,
        passwordArb,
        async (email, code, codeId, userId, tenantId, password1, password2) => {
          const markUsedCalls: string[] = [];
          const passwordUpdates: Array<{ id: string; password: string }> = [];

          const row: PasswordResetCodeRow = {
            id: codeId,
            user_id: userId,
            tenant_id: tenantId,
            code_hash: hashCode(code),
            expires_at: new Date(Date.now() + 15 * 60 * 1_000),
            used_at: null,
            attempts: 0,
            created_at: new Date(),
          };

          const deps: ConfirmResetDeps = {
            repository: buildInMemoryRepository(row, markUsedCalls),
            supabaseAdmin: buildFakeSupabaseAdmin(passwordUpdates),
          };

          // 1) Primeiro uso: sucesso. O código é marcado como utilizado (R5.3).
          await expect(
            confirmReset({ email, code, newPassword: password1 }, deps),
          ).resolves.toBeUndefined();

          expect(markUsedCalls).toEqual([codeId]);
          expect(passwordUpdates).toHaveLength(1);
          expect(passwordUpdates[0]).toEqual({ id: userId, password: password1 });
          expect(row.used_at).not.toBeNull();

          // 2) Reuso do MESMO código: recusado com ServiceError INVALID_CODE
          //    (R3.7/R6.3), sem atualizar a senha novamente.
          let thrown: unknown;
          try {
            await confirmReset({ email, code, newPassword: password2 }, deps);
          } catch (err) {
            thrown = err;
          }

          expect(thrown).toBeInstanceOf(ServiceError);
          const serviceError = thrown as ServiceError;
          expect(serviceError.code).toBe('INVALID_CODE');
          expect(serviceError.statusCode).toBe(400);
          expect(serviceError.message).toBe('Código inválido ou expirado');

          // A senha NÃO é atualizada uma segunda vez e `markUsed` não é
          // chamado novamente (o código já não é ativo).
          expect(passwordUpdates).toHaveLength(1);
          expect(markUsedCalls).toEqual([codeId]);
        },
      ),
      { numRuns: 100 },
    );
  });
});
