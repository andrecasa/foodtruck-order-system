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
 * Feature: forgot-password, Property 13: Redefinição bem-sucedida é correta e isolada
 *
 * Para qualquer Codigo_Verificacao válido, não expirado, não utilizado e dentro
 * do limite de tentativas, submetido com uma nova senha válida (8–72
 * caracteres), o Sistema_Recuperacao deve atualizar a senha exclusivamente do
 * usuário associado ao código, sem afetar qualquer outro usuário.
 *
 * **Validates: Requirements 5.2, 6.5, 8.2**
 *
 * Abordagem: exercitamos o serviço REAL `confirmReset`, injetando via `deps` um
 * repositório falso (que retorna um código ativo cujo `code_hash` casa com o
 * código submetido) e um `supabaseAdmin` falso. Verificamos que
 * `updateUserById` é chamado EXATAMENTE UMA VEZ e SOMENTE para o `user_id`
 * associado ao código (isolamento — R8.2), que `markUsed` é chamado com o id do
 * código (R6.5/R5.3) e que `signOut(user_id, 'global')` invalida as sessões do
 * usuário correto (R5.4).
 */

import {
  confirmReset,
  hashCode,
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

// Código válido: exatamente 6 dígitos, com zeros à esquerda permitidos.
const codeArb = fc
  .integer({ min: 0, max: 999_999 })
  .map((n) => n.toString().padStart(6, '0'));

// Senha válida conforme a política: 8 a 72 caracteres inclusive.
const passwordArb = fc.string({ minLength: 8, maxLength: 72 });

// --- Test doubles -------------------------------------------------------------

interface MarkUsedCall {
  codeId: string;
}

/**
 * Repositório falso que retorna, para qualquer e-mail, um único código ativo
 * (a `row` fornecida). Captura chamadas a `markUsed` e falha se
 * `registerFailedAttempt` for chamado — isso só ocorreria num caminho de recusa,
 * que NÃO deve acontecer nesta propriedade (código válido).
 */
function buildFakeRepository(
  row: PasswordResetCodeRow,
  markUsedCalls: MarkUsedCall[],
): PasswordResetRepository {
  return {
    findUsersByEmail: async () => {
      throw new Error('not used in confirmReset');
    },
    invalidateActiveCodes: async () => {
      throw new Error('not used in confirmReset');
    },
    insertCode: async () => {
      throw new Error('not used in confirmReset');
    },
    findActiveCodeForEmail: async () => row,
    registerFailedAttempt: async () => {
      throw new Error('registerFailedAttempt should NOT be called for a valid code');
    },
    markUsed: async (codeId) => {
      markUsedCalls.push({ codeId });
    },
    invalidateCode: async () => {
      throw new Error('not used in confirmReset');
    },
  };
}

interface UpdateCall {
  id: string;
  password: string;
}

interface SignOutCall {
  id: string;
  scope: 'global';
}

/**
 * Cliente Supabase admin falso bem-sucedido. Captura toda chamada a
 * `updateUserById` e `signOut`, permitindo verificar o alvo (isolamento).
 */
function buildFakeSupabaseAdmin(
  updateCalls: UpdateCall[],
  signOutCalls: SignOutCall[],
): SupabaseAdminLike {
  return {
    auth: {
      admin: {
        updateUserById: async (id, attributes) => {
          updateCalls.push({ id, password: attributes.password });
          return { error: null };
        },
        signOut: async (id, scope) => {
          signOutCalls.push({ id, scope });
          return undefined;
        },
      },
    },
  };
}

// --- Tests --------------------------------------------------------------------

describe('Feature: forgot-password, Property 13: Redefinição bem-sucedida é correta e isolada', () => {
  it('atualiza a senha SOMENTE do usuário associado ao código, marca usado e invalida sessões', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        codeArb,
        passwordArb,
        fc.uuid(), // user_id associado ao código
        fc.uuid(), // tenant_id associado ao código
        fc.uuid(), // outro user_id (não deve ser afetado)
        async (email, code, newPassword, userId, tenantId, otherUserId) => {
          // Garante que o "outro usuário" é distinto do alvo.
          fc.pre(otherUserId !== userId);

          const markUsedCalls: MarkUsedCall[] = [];
          const updateCalls: UpdateCall[] = [];
          const signOutCalls: SignOutCall[] = [];

          // Código ativo cujo hash casa com o código submetido: válido, não
          // expirado, não usado, dentro do limite de tentativas.
          const row: PasswordResetCodeRow = {
            id: 'code-1',
            user_id: userId,
            tenant_id: tenantId,
            code_hash: hashCode(code),
            expires_at: new Date(Date.now() + 15 * 60 * 1_000),
            used_at: null,
            attempts: 0,
            created_at: new Date(),
          };

          const deps: ConfirmResetDeps = {
            repository: buildFakeRepository(row, markUsedCalls),
            supabaseAdmin: buildFakeSupabaseAdmin(updateCalls, signOutCalls),
          };

          await confirmReset({ email, code, newPassword }, deps);

          // updateUserById chamado exatamente uma vez, SOMENTE para o usuário
          // associado ao código, com a nova senha (isolamento — R5.2/R8.2).
          expect(updateCalls).toHaveLength(1);
          expect(updateCalls[0].id).toBe(userId);
          expect(updateCalls[0].password).toBe(newPassword);
          // Nenhum outro usuário é afetado.
          expect(updateCalls[0].id).not.toBe(otherUserId);

          // O código é marcado como usado exatamente uma vez (R6.5/R5.3).
          expect(markUsedCalls).toHaveLength(1);
          expect(markUsedCalls[0].codeId).toBe(row.id);

          // As sessões do usuário correto são invalidadas globalmente (R5.4).
          expect(signOutCalls).toHaveLength(1);
          expect(signOutCalls[0].id).toBe(userId);
          expect(signOutCalls[0].scope).toBe('global');
        },
      ),
      { numRuns: 100 },
    );
  });
});
