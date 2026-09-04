import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// O serviço importa `config/supabase.js` e `config/database.js`, que exigem
// credenciais/pool reais no carregamento. Como as dependências relevantes são
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
  type ConfirmResetDeps,
  type SupabaseAdminLike,
} from '../../services/password-reset.service.js';
import type {
  PasswordResetCodeRow,
  PasswordResetRepository,
} from '../../db/password-reset-repository.js';

/**
 * Feature: forgot-password, Property 14: Códigos inválidos não alteram a senha
 *
 * Para qualquer `Codigo_Verificacao` inválido (não corresponde ao armazenado),
 * expirado, já utilizado, ou cujo par e-mail+código não resolve um usuário, o
 * `Sistema_Recuperacao` deve recusar a redefinição com mensagem em pt-BR sem
 * alterar nenhuma senha.
 *
 * O teste exercita `confirmReset` injetando um repositório e um cliente Supabase
 * admin mockados, modelando os dois caminhos de recusa:
 *   (a) `findActiveCodeForEmail` retorna `null` — nenhum candidato ativo
 *       (código inexistente, expirado, já usado ou limite de tentativas atingido,
 *       ou par e-mail+código que não resolve usuário);
 *   (b) `findActiveCodeForEmail` retorna uma linha cujo `code_hash` NÃO casa com
 *       `hashCode(codigoSubmetido)` — código incorreto.
 *
 * Em ambos os casos verifica-se que:
 *   - `confirmReset` lança `ServiceError(400, 'INVALID_CODE', 'Código inválido ou expirado')`;
 *   - `supabaseAdmin.auth.admin.updateUserById` NUNCA é chamado (senha inalterada);
 *   - quando existe uma linha candidata (caso b), `registerFailedAttempt` é chamado.
 *
 * **Validates: Requirements 5.7, 6.1, 6.2, 8.4**
 */
describe('Feature: forgot-password, Property 14: Códigos inválidos não alteram a senha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // E-mail em formato válido (o formato inválido é coberto pela Property 2/16).
  const validEmail = fc
    .tuple(
      fc.stringMatching(/^[a-z0-9]{1,20}$/),
      fc.stringMatching(/^[a-z0-9]{1,15}$/),
      fc.constantFrom('com', 'com.br', 'net', 'org', 'io'),
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= 254);

  // Código de exatamente 6 dígitos (passa na validação de schema).
  const sixDigitCode = fc
    .integer({ min: 0, max: 999_999 })
    .map((n) => String(n).padStart(6, '0'));

  // Nova senha válida (8–72 caracteres) — para isolar a falha ao código, não à senha.
  const validPassword = fc.string({ minLength: 8, maxLength: 72 });

  /**
   * Cria um repositório mock cujo `findActiveCodeForEmail` devolve `row`.
   * Todos os métodos são espiões para permitir assertivas.
   */
  function makeMockRepository(
    row: PasswordResetCodeRow | null,
  ): PasswordResetRepository {
    return {
      findUsersByEmail: vi.fn(async () => []),
      invalidateActiveCodes: vi.fn(async () => {}),
      insertCode: vi.fn(async (): Promise<PasswordResetCodeRow> => {
        throw new Error('not used');
      }),
      findActiveCodeForEmail: vi.fn(async () => row),
      registerFailedAttempt: vi.fn(async (): Promise<PasswordResetCodeRow> => {
        // Retorna a linha "atualizada"; o conteúdo não afeta o fluxo de recusa.
        return (
          row ?? {
            id: 'x',
            user_id: 'x',
            tenant_id: 'x',
            code_hash: 'x',
            expires_at: new Date(),
            used_at: null,
            attempts: 1,
            created_at: new Date(),
          }
        );
      }),
      markUsed: vi.fn(async () => {}),
      invalidateCode: vi.fn(async () => {}),
    };
  }

  /** Cliente Supabase admin mock. `updateUserById` não deve ser chamado. */
  function makeMockSupabaseAdmin(): SupabaseAdminLike {
    return {
      auth: {
        admin: {
          updateUserById: vi.fn(async () => ({ error: null })),
          signOut: vi.fn(async () => ({})),
        },
      },
    };
  }

  it('sem código candidato (findActiveCodeForEmail → null) recusa sem alterar a senha', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail,
        sixDigitCode,
        validPassword,
        async (email, code, newPassword) => {
          const repository = makeMockRepository(null);
          const supabaseAdmin = makeMockSupabaseAdmin();
          const deps: ConfirmResetDeps = { repository, supabaseAdmin };

          await expect(
            confirmReset({ email, code, newPassword }, deps),
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_CODE',
            message: 'Código inválido ou expirado',
          });

          // Deve ser um ServiceError propriamente dito.
          await confirmReset({ email, code, newPassword }, deps).catch((err) => {
            expect(err).toBeInstanceOf(ServiceError);
          });

          // Property: senha nunca é alterada.
          expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
          // Sem candidato: nada de sessões, marcação de uso ou tentativa registrada.
          expect(supabaseAdmin.auth.admin.signOut).not.toHaveBeenCalled();
          expect(repository.markUsed).not.toHaveBeenCalled();
          expect(repository.registerFailedAttempt).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('código incorreto (hash divergente) recusa, registra tentativa e não altera a senha', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail,
        // Par de códigos distintos: o submetido difere do código armazenado.
        fc
          .tuple(sixDigitCode, sixDigitCode)
          .filter(([submitted, stored]) => submitted !== stored),
        validPassword,
        fc.uuid(),
        fc.uuid(),
        async (email, [submittedCode, storedCode], newPassword, userId, tenantId) => {
          const row: PasswordResetCodeRow = {
            id: 'code-1',
            user_id: userId,
            tenant_id: tenantId,
            code_hash: hashCode(storedCode), // hash do código ARMAZENADO (correto)
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
            used_at: null,
            attempts: 0,
            created_at: new Date(),
          };
          const repository = makeMockRepository(row);
          const supabaseAdmin = makeMockSupabaseAdmin();
          const deps: ConfirmResetDeps = { repository, supabaseAdmin };

          await expect(
            confirmReset(
              { email, code: submittedCode, newPassword },
              deps,
            ),
          ).rejects.toMatchObject({
            statusCode: 400,
            code: 'INVALID_CODE',
            message: 'Código inválido ou expirado',
          });

          // Property: senha nunca é alterada e sessões não são invalidadas.
          expect(supabaseAdmin.auth.admin.updateUserById).not.toHaveBeenCalled();
          expect(supabaseAdmin.auth.admin.signOut).not.toHaveBeenCalled();
          expect(repository.markUsed).not.toHaveBeenCalled();
          // Existindo candidato, a tentativa incorreta é registrada (R6.4).
          expect(repository.registerFailedAttempt).toHaveBeenCalledWith(row.id);
        },
      ),
      { numRuns: 100 },
    );
  });
});
