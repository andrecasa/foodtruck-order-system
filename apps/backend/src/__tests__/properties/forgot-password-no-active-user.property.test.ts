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

import { requestCode } from '../../services/password-reset.service.js';
import type {
  ActiveUser,
  PasswordResetCodeRow,
  PasswordResetRepository,
} from '../../db/password-reset-repository.js';
import type { EmailService } from '../../services/email/email.service.js';

/**
 * Feature: forgot-password, Property 3: Solicitação sem usuário ativo não gera código
 *
 * Para qualquer e-mail que não corresponda a nenhum usuário `ativo` (inexistente
 * ou apenas `inativo`), o `Sistema_Recuperacao` não deve persistir nenhum
 * `Codigo_Verificacao`.
 *
 * O teste exercita `requestCode` injetando um repositório mock cujo
 * `findUsersByEmail` retorna: (a) uma lista vazia (e-mail inexistente) ou
 * (b) apenas usuários com `status` igual a `inativo`. Em ambos os casos,
 * `insertCode` (persistência do código) nunca deve ser chamado.
 *
 * **Validates: Requirements 2.5, 2.6**
 */
describe('Feature: forgot-password, Property 3: Solicitação sem usuário ativo não gera código', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Gera um e-mail em formato válido (o formato inválido é coberto pela Property 2).
  const validEmail = fc
    .tuple(
      fc.stringMatching(/^[a-z0-9]{1,20}$/),
      fc.stringMatching(/^[a-z0-9]{1,15}$/),
      fc.constantFrom('com', 'com.br', 'net', 'org', 'io'),
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
    .filter((email) => email.length <= 254);

  // Gera um usuário inativo associado ao e-mail.
  const inactiveUser = (email: string): fc.Arbitrary<ActiveUser> =>
    fc.record({
      id: fc.uuid(),
      tenant_id: fc.uuid(),
      email: fc.constant(email),
      status: fc.constant<'inativo'>('inativo'),
    });

  /**
   * Cria um repositório mock. `findUsersByEmail` devolve os usuários fornecidos.
   * Todos os demais métodos são espiões para permitir assertivas.
   */
  function makeMockRepository(users: ActiveUser[]): PasswordResetRepository {
    return {
      findUsersByEmail: vi.fn(async () => users),
      invalidateActiveCodes: vi.fn(async () => {}),
      insertCode: vi.fn(async (): Promise<PasswordResetCodeRow> => {
        // Nunca deve ser chamado neste cenário; se for, o teste falha nas assertivas.
        return {
          id: 'should-not-happen',
          user_id: 'x',
          tenant_id: 'x',
          code_hash: 'x',
          expires_at: new Date(),
          used_at: null,
          attempts: 0,
          created_at: new Date(),
        };
      }),
      findActiveCodeForEmail: vi.fn(async () => null),
      registerFailedAttempt: vi.fn(async (): Promise<PasswordResetCodeRow> => {
        throw new Error('not used');
      }),
      markUsed: vi.fn(async () => {}),
      invalidateCode: vi.fn(async () => {}),
    };
  }

  /** Serviço de e-mail mock (fire-and-forget, não deve ser acionado). */
  function makeMockEmail(): EmailService {
    return {
      sendVerificationCode: vi.fn(),
    };
  }

  it('e-mail inexistente (nenhum usuário) não persiste nenhum código', async () => {
    await fc.assert(
      fc.asyncProperty(validEmail, async (email) => {
        const repository = makeMockRepository([]);
        const email$ = makeMockEmail();

        await requestCode(email, { repository, email: email$ });

        // Property: nenhum código é persistido nem enviado.
        expect(repository.insertCode).not.toHaveBeenCalled();
        expect(repository.invalidateActiveCodes).not.toHaveBeenCalled();
        expect(email$.sendVerificationCode).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('apenas usuários inativos não persistem nenhum código', async () => {
    await fc.assert(
      fc.asyncProperty(
        validEmail.chain((email) =>
          fc
            .array(inactiveUser(email), { minLength: 1, maxLength: 4 })
            .map((users) => ({ email, users })),
        ),
        async ({ email, users }) => {
          const repository = makeMockRepository(users);
          const email$ = makeMockEmail();

          await requestCode(email, { repository, email: email$ });

          // Property: usuários apenas `inativo` são ignorados — nada é persistido/enviado.
          expect(repository.insertCode).not.toHaveBeenCalled();
          expect(repository.invalidateActiveCodes).not.toHaveBeenCalled();
          expect(email$.sendVerificationCode).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
