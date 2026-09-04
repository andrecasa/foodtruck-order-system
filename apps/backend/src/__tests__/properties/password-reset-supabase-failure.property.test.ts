import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// O serviço importa transitivamente `config/supabase.js` e `config/database.js`,
// que exigem credenciais/pool reais no load. Como as dependências relevantes são
// injetadas via `deps`, mockamos ambos os módulos apenas para permitir o import.
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn(), signOut: vi.fn() } } },
}));
vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import {
  confirmReset,
  hashCode,
  ServiceError,
} from '../../services/password-reset.service.js';
import type {
  ConfirmResetDeps,
  SupabaseAdminLike,
} from '../../services/password-reset.service.js';
import type {
  PasswordResetCodeRow,
  PasswordResetRepository,
} from '../../db/password-reset-repository.js';

/**
 * Feature: forgot-password, Property 15: Falha do Supabase preserva o código não utilizado
 *
 * Sempre que a atualização de senha no Supabase (`updateUserById`) falhar
 * (retornando `{ error }`), `confirmReset` deve rejeitar com um `ServiceError`
 * pt-BR (500 / INTERNAL_ERROR / "Erro ao redefinir senha") e o
 * `Codigo_Verificacao` associado NÃO pode ser marcado como usado — permanece
 * disponível para uma nova tentativa (R5.8).
 *
 * **Validates: Requirements 5.8**
 *
 * Exercitamos `confirmReset` com um repositório e um cliente Supabase admin
 * injetados (mocks). Fornecemos sempre um código VÁLIDO e correspondente
 * (`hashCode(code) === row.code_hash`) para chegar até a etapa do Supabase, e
 * forçamos a falha da atualização de senha. Verificamos que:
 *  - `confirmReset` lança `ServiceError(500, 'INTERNAL_ERROR', 'Erro ao redefinir senha')`;
 *  - `repository.markUsed` NUNCA é chamado (o código continua não utilizado);
 *  - `signOut` também não é acionado (só ocorre após sucesso).
 */

// --- Generators ---------------------------------------------------------------

/** Local part + domain que sempre compõem um e-mail válido (passa no Zod). */
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,12}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.constantFrom('com', 'com.br', 'org', 'net'),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Código de exatamente 6 dígitos (casa o schema `^\d{6}$`). */
const codeArb = fc.stringMatching(/^\d{6}$/);

/** Senha válida no intervalo permitido (8–72 caracteres). */
const passwordArb = fc.string({ minLength: 8, maxLength: 72 });

/** Erro retornado pelo Supabase — pode assumir formatos diversos (todos "truthy"). */
const supabaseErrorArb = fc.oneof(
  fc.constant({ message: 'AuthApiError' }),
  fc.record({ message: fc.string({ minLength: 1, maxLength: 20 }), status: fc.integer() }),
  fc.constant(new Error('boom')),
  fc.constant('failure'),
);

// --- Fakes --------------------------------------------------------------------

interface FakeState {
  markUsedCalls: number;
  signOutCalls: number;
  registerFailedCalls: number;
}

/**
 * Repositório em memória cujo `findActiveCodeForEmail` devolve uma linha ATIVA
 * cujo `code_hash` corresponde ao código fornecido — de modo que a validação
 * passa e o fluxo alcança a chamada ao Supabase.
 */
function makeRepository(row: PasswordResetCodeRow, state: FakeState): PasswordResetRepository {
  return {
    findUsersByEmail: vi.fn(async () => {
      throw new Error('not used in this property');
    }),
    invalidateActiveCodes: vi.fn(async () => {}),
    insertCode: vi.fn(async () => {
      throw new Error('not used in this property');
    }),
    findActiveCodeForEmail: vi.fn(async () => ({ ...row })),
    registerFailedAttempt: vi.fn(async () => {
      state.registerFailedCalls += 1;
      return { ...row };
    }),
    markUsed: vi.fn(async () => {
      state.markUsedCalls += 1;
    }),
    invalidateCode: vi.fn(async () => {}),
  };
}

/** Cliente Supabase admin que sempre FALHA a atualização de senha. */
function makeFailingSupabase(error: unknown, state: FakeState): SupabaseAdminLike {
  return {
    auth: {
      admin: {
        updateUserById: vi.fn(async () => ({ error })),
        signOut: vi.fn(async () => {
          state.signOutCalls += 1;
          return undefined;
        }),
      },
    },
  };
}

// --- Property -----------------------------------------------------------------

describe('Property 15: Falha do Supabase preserva o código não utilizado', () => {
  it('throws pt-BR ServiceError(500, INTERNAL_ERROR) and never marks the code as used', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        codeArb,
        passwordArb,
        fc.uuid(),
        fc.uuid(),
        supabaseErrorArb,
        async (email, code, newPassword, userId, tenantId, sbError) => {
          const state: FakeState = {
            markUsedCalls: 0,
            signOutCalls: 0,
            registerFailedCalls: 0,
          };

          // Código ativo e correspondente: passa a validação de hash.
          const row: PasswordResetCodeRow = {
            id: `code-${userId}`,
            user_id: userId,
            tenant_id: tenantId,
            code_hash: hashCode(code),
            expires_at: new Date(Date.now() + 15 * 60 * 1_000),
            used_at: null,
            attempts: 0,
            created_at: new Date(),
          };

          const deps: ConfirmResetDeps = {
            repository: makeRepository(row, state),
            supabaseAdmin: makeFailingSupabase(sbError, state),
          };

          // A falha do Supabase deve produzir um ServiceError pt-BR (R5.8).
          const error = await confirmReset({ email, code, newPassword }, deps).then(
            () => null,
            (e) => e,
          );

          expect(error).toBeInstanceOf(ServiceError);
          expect((error as ServiceError).statusCode).toBe(500);
          expect((error as ServiceError).code).toBe('INTERNAL_ERROR');
          expect((error as ServiceError).message).toBe('Erro ao redefinir senha');

          // O código NÃO é marcado como usado — permanece disponível (R5.8).
          expect(state.markUsedCalls).toBe(0);
          // Nenhuma tentativa incorreta foi registrada (o código era válido).
          expect(state.registerFailedCalls).toBe(0);
          // signOut só ocorre após sucesso; aqui não deve ser chamado.
          expect(state.signOutCalls).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
