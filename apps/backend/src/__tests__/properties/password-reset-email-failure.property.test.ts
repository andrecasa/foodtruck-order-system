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

import { requestCode } from '../../services/password-reset.service.js';
import type { RequestCodeDeps } from '../../services/password-reset.service.js';
import type {
  ActiveUser,
  PasswordResetCodeRow,
  PasswordResetRepository,
} from '../../db/password-reset-repository.js';
import type { EmailService } from '../../services/email/email.service.js';

/**
 * Feature: forgot-password, Property 8: Falha total de e-mail invalida o código gerado
 *
 * Para qualquer solicitação em que o Servico_Email falhe em todas as 3 tentativas
 * de envio, o Codigo_Verificacao correspondente deve terminar invalidado, sem que
 * a resposta ao cliente deixe de ser a Mensagem_Neutra.
 *
 * **Validates: Requirements 2.7, 9.3**
 *
 * Aqui exercitamos `requestCode` com um repositório e um serviço de e-mail
 * injetados (mocks). O serviço de e-mail simula a FALHA TOTAL de envio: em vez de
 * entregar, invoca imediatamente o callback `onAllAttemptsFailed` fornecido por
 * `requestCode` (o mesmo comportamento observável do `RetryingEmailService` após
 * esgotar as 3 tentativas). Verificamos que:
 *  - cada código gerado (um por usuário `ativo`) é invalidado via
 *    `repository.invalidateCode`, com o id exato do código inserido; e
 *  - `requestCode` retorna `void` sem lançar (a resposta ao cliente permanece
 *    a Mensagem_Neutra, garantida pelo controller sobre esse `void`).
 */

// --- Generators ---------------------------------------------------------------

const statusArb = fc.constantFrom<'ativo' | 'inativo'>('ativo', 'inativo');

/** Local part + domain that always compose a valid e-mail (passes Zod). */
const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,12}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.constantFrom('com', 'com.br', 'org', 'net'),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

const userArb = fc.record({
  id: fc.uuid(),
  tenant_id: fc.uuid(),
  status: statusArb,
});

// --- Fakes --------------------------------------------------------------------

interface FakeState {
  invalidatedIds: string[];
  insertedIds: string[];
}

/**
 * Repositório em memória. Guarda o que foi inserido e o que foi invalidado.
 * `insertCode` devolve uma linha com um id determinístico por ordem de inserção.
 */
function makeRepository(users: ActiveUser[], state: FakeState): PasswordResetRepository {
  let insertCounter = 0;

  return {
    findUsersByEmail: vi.fn(async () => users.map((u) => ({ ...u }))),
    invalidateActiveCodes: vi.fn(async () => {}),
    insertCode: vi.fn(async (input): Promise<PasswordResetCodeRow> => {
      insertCounter += 1;
      const id = `code-${insertCounter}`;
      state.insertedIds.push(id);
      return {
        id,
        user_id: input.userId,
        tenant_id: input.tenantId,
        code_hash: input.codeHash,
        expires_at: input.expiresAt,
        used_at: null,
        attempts: 0,
        created_at: new Date(),
      };
    }),
    findActiveCodeForEmail: vi.fn(async () => null),
    registerFailedAttempt: vi.fn(async () => {
      throw new Error('not used in this property');
    }),
    markUsed: vi.fn(async () => {}),
    invalidateCode: vi.fn(async (codeId: string) => {
      state.invalidatedIds.push(codeId);
    }),
  };
}

/**
 * Serviço de e-mail que simula falha total: dispara o `onAllAttemptsFailed`
 * imediatamente (fire-and-forget, como a implementação real após 3 falhas) e
 * NUNCA lança para o chamador.
 */
function makeFailingEmailService(): EmailService {
  return {
    sendVerificationCode: ({ onAllAttemptsFailed }) => {
      // Não aguardamos aqui (o contrato é fire-and-forget); mas a promise é
      // encadeada para que o teste possa esperar sua conclusão.
      pendingFailures.push(onAllAttemptsFailed());
    },
  };
}

// Coleta as promises de invalidação disparadas pelo e-mail para que o teste as aguarde.
let pendingFailures: Promise<void>[];

// --- Property -----------------------------------------------------------------

describe('Property 8: Falha total de e-mail invalida o código gerado', () => {
  it('invalidates every generated code and requestCode resolves to void without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        fc.array(userArb, { minLength: 0, maxLength: 6 }),
        async (email, rawUsers) => {
          pendingFailures = [];

          const users: ActiveUser[] = rawUsers.map((u) => ({
            id: u.id,
            tenant_id: u.tenant_id,
            email,
            status: u.status,
          }));

          const state: FakeState = { invalidatedIds: [], insertedIds: [] };
          const deps: RequestCodeDeps = {
            repository: makeRepository(users, state),
            email: makeFailingEmailService(),
          };

          // Resposta neutra: requestCode nunca lança neste fluxo.
          const result = await requestCode(email, deps);
          expect(result).toBeUndefined();

          // Aguarda as invalidações assíncronas disparadas pela falha de e-mail.
          await Promise.all(pendingFailures);

          // Um código é gerado por usuário ATIVO (inativos são ignorados, R2.6).
          const activeCount = users.filter((u) => u.status === 'ativo').length;
          expect(state.insertedIds).toHaveLength(activeCount);

          // Falha total ⇒ todo código gerado termina invalidado, pelo id exato.
          expect([...state.invalidatedIds].sort()).toEqual([...state.insertedIds].sort());
        },
      ),
      { numRuns: 100 },
    );
  });
});
