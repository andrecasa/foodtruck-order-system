import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock supabaseAdmin para que importar o service não construa um cliente
// Supabase real na carga do módulo (que exigiria chaves de ambiente). Todos os
// efeitos de auth são injetados via `deps`, então o mock só precisa existir.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock do pool compartilhado para que o módulo carregue sem abrir uma conexão
// real. Os testes injetam seu próprio pool falso via `deps.pool`.
vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn() },
}));

import {
  provisionTenant,
  ProvisioningError,
  type ProvisionTenantInput,
  type ProvisionDeps,
} from '../../services/tenant-provision.service.js';

/**
 * Feature: landing-onboarding, Property 8 (atomicidade do provisionamento):
 * **falha reverte todas as escritas — via `ProvisionDeps` mock**.
 *
 * *Para qualquer* entrada de cadastro válida (incluindo os campos estendidos
 * `contact`, `trialEndsAt` e `subscriptionStatus` da tarefa 3.1), SE qualquer
 * passo do provisionamento falhar (uma query do INSERT ou o `provisionEvolution`),
 * ENTÃO a transação SHALL ser revertida por completo: um `ROLLBACK` é emitido,
 * nenhum `COMMIT` acontece e o usuário de auth criado (se houver) é compensado
 * com `deleteAuthUser`. Assim, nenhuma escrita de tenant/trial/contato persiste.
 *
 * As escritas estendidas entram no MESMO `INSERT INTO tenants` da criação, então
 * atomicidade do INSERT do tenant já cobre trial + contato: ou o tenant inteiro
 * (com trial/contato) é commitado, ou nada é. O teste reafirma essa invariante
 * cobrindo cada ponto de falha da transação.
 *
 * Os efeitos externos (pool `pg`, Supabase Auth, Evolution API) são falsos, de
 * modo que o teste roda sem banco real nem Evolution acessível, exercitando o
 * controle transacional real (BEGIN/COMMIT/ROLLBACK e a compensação de auth).
 *
 * **Validates: Requirements 10.3**
 */

// --- Cliente de pool falso que grava as queries executadas ---

interface RecordedQuery {
  text: string;
  params?: unknown[];
}

interface FakeClientOptions {
  /** Se definido, a query cujo texto contém este trecho lança um erro. */
  failOnQueryContaining?: string;
}

function makeFakeClient(opts: FakeClientOptions = {}) {
  const queries: RecordedQuery[] = [];
  let released = false;

  const client = {
    async query(text: string, params?: unknown[]) {
      queries.push({ text, params });

      if (opts.failOnQueryContaining && text.includes(opts.failOnQueryContaining)) {
        throw new Error(`Falha de DB simulada em: ${opts.failOnQueryContaining}`);
      }

      // Lookup de idempotência: sempre "não existe" para exercitar o caminho de criação.
      if (/SELECT .*FROM tenants WHERE provisioning_key/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT id FROM users WHERE tenant_id/i.test(text)) {
        return { rows: [], rowCount: 0 };
      }
      // INSERT do tenant (inclui trial_ends_at / subscription_status / contact_*).
      if (/INSERT INTO tenants/i.test(text)) {
        return {
          rows: [{ id: 'tenant-new', business_name: (params?.[0] as string) ?? 'X', status: 'ativo' }],
          rowCount: 1,
        };
      }
      // INSERT de categoria.
      if (/INSERT INTO categories/i.test(text)) {
        return { rows: [{ id: `cat-${queries.length}` }], rowCount: 1 };
      }
      // Demais (BEGIN/COMMIT/ROLLBACK, menu_items, users).
      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  };

  return {
    client,
    queries,
    wasReleased: () => released,
  };
}

function makeDeps(
  clientBundle: ReturnType<typeof makeFakeClient>,
  over?: Partial<ProvisionDeps>,
): {
  deps: Partial<ProvisionDeps>;
  createAuthUser: ReturnType<typeof vi.fn>;
  deleteAuthUser: ReturnType<typeof vi.fn>;
  provisionEvolution: ReturnType<typeof vi.fn>;
} {
  const createAuthUser = vi.fn(async () => 'auth-user-1');
  const deleteAuthUser = vi.fn(async () => {});
  const provisionEvolution = vi.fn(async () => {});

  const deps: Partial<ProvisionDeps> = {
    createAuthUser,
    deleteAuthUser,
    provisionEvolution,
    webhookBaseUrl: 'https://api.example.com',
    pool: { connect: async () => clientBundle.client as never },
    ...over,
  };

  return { deps, createAuthUser, deleteAuthUser, provisionEvolution };
}

function texts(bundle: ReturnType<typeof makeFakeClient>): string[] {
  return bundle.queries.map((q) => q.text);
}

/** Encontra os params do INSERT INTO tenants, se ele chegou a rodar. */
function tenantInsertParams(bundle: ReturnType<typeof makeFakeClient>): unknown[] | undefined {
  return bundle.queries.find((q) => /INSERT INTO tenants/i.test(q.text))?.params;
}

// --- Gerador de entrada de cadastro válida (com campos estendidos R11) ---

// Mesmo conjunto reservado de `signup-slug.util.ts`; slugs reservados são
// rejeitados como ValidationError, então os excluímos para focar em atomicidade.
const RESERVED_SLUGS_FOR_TEST = new Set([
  'api', 'admin', 'health', 'webhook', 'static', 'assets', 'public', 'login', 'queue',
]);

// Nomes com pelo menos uma letra (nunca só espaços), para que passem por
// `validateInput` (que rejeita string em branco após trim) e o teste exercite
// o caminho transacional — o foco é atomicidade, não validação de entrada.
const nonBlankNameArb = fc.stringMatching(/^[A-Za-z]{1,20}( [A-Za-z]{1,20})?$/);

const contactArb = fc.record({
  name: nonBlankNameArb,
  phone: fc.stringMatching(/^\+?[1-9]\d{9,14}$/),
});

const signupInputArb: fc.Arbitrary<ProvisionTenantInput> = fc.record({
  provisioningKey: fc.stringMatching(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/),
  businessName: nonBlankNameArb,
  evolutionInstanceName: fc.stringMatching(/^[a-z0-9-]{3,30}$/),
  admin: fc.record({
    name: nonBlankNameArb,
    email: fc.stringMatching(/^[a-z]{3,10}@[a-z]{3,10}\.com$/),
    password: fc.stringMatching(/^[A-Za-z0-9!]{8,20}$/),
  }),
  contact: fc.option(contactArb, { nil: null }),
  trialEndsAt: fc.option(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2030-12-31') }),
    { nil: null },
  ),
  subscriptionStatus: fc.constantFrom<'trial' | 'active' | 'canceled'>('trial', 'active', 'canceled'),
})
  .filter((base) => !RESERVED_SLUGS_FOR_TEST.has(base.provisioningKey))
  .map((base) => ({
  ...base,
  // Slug com prefixo garante formato válido e evita colidir com reservados,
  // mantendo o foco em atomicidade (não em validação de slug).
  menuPreset: {
    categories: [
      { name: 'Salgados', items: [{ name: 'Pastel de Carne', priceCents: 900 }] },
    ],
  },
}));

describe('landing-onboarding Property 8: falha reverte TODAS as escritas (tenant + trial + contato)', () => {
  it('property: qualquer passo que falhe emite ROLLBACK, nunca COMMIT, e compensa o auth user', async () => {
    // Pontos de falha ao longo da transação de criação de tenant novo. Cobre a
    // escrita estendida (INSERT INTO tenants com trial/contato) e todos os passos
    // seguintes, incluindo o efeito externo `provisionEvolution`.
    const dbFailPoints = [
      'INSERT INTO tenants',
      'INSERT INTO categories',
      'INSERT INTO menu_items',
      'INSERT INTO users',
    ] as const;

    await fc.assert(
      fc.asyncProperty(
        signupInputArb,
        fc.constantFrom(...dbFailPoints, '__EVOLUTION__'),
        async (input, failAt) => {
          const evolutionFails = failAt === '__EVOLUTION__';
          const bundle = makeFakeClient(
            evolutionFails ? {} : { failOnQueryContaining: failAt },
          );
          const provisionEvolution = evolutionFails
            ? vi.fn(async () => {
                throw new Error('Evolution inacessível');
              })
            : vi.fn(async () => {});
          const { deps, createAuthUser, deleteAuthUser } = makeDeps(bundle, {
            provisionEvolution,
          });

          await expect(provisionTenant(input, deps)).rejects.toBeInstanceOf(ProvisioningError);

          const t = texts(bundle);

          // Invariante central: ROLLBACK emitido, COMMIT nunca.
          expect(t.some((x) => x.includes('ROLLBACK'))).toBe(true);
          expect(t.some((x) => x.includes('COMMIT'))).toBe(false);

          // O cliente sempre é liberado (finally).
          expect(bundle.wasReleased()).toBe(true);

          // Se o INSERT INTO tenants chegou a rodar, ele carregava os campos
          // estendidos (trial + contato) no MESMO comando — ou seja, revertê-lo
          // reverte trial e contato juntos. $8=trial_ends_at, $10=contact_name,
          // $11=contact_phone (ver INSERT em tenant-provision.service.ts).
          const insertParams = tenantInsertParams(bundle);
          if (insertParams) {
            expect(insertParams[7]).toBe(input.trialEndsAt ?? null);
            expect(insertParams[9]).toBe(input.contact?.name ?? null);
            expect(insertParams[10]).toBe(input.contact?.phone ?? null);
          }

          // Compensação do usuário de auth: se e somente se ele foi criado antes
          // da falha, `deleteAuthUser` é chamado para não deixar auth órfão.
          if (createAuthUser.mock.calls.length > 0) {
            expect(deleteAuthUser).toHaveBeenCalledWith('auth-user-1');
          } else {
            expect(deleteAuthUser).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 150 },
    );
  });

  it('property: falha no INSERT INTO tenants não persiste nenhuma escrita de trial/contato', async () => {
    // Foco específico: quando a própria escrita estendida falha, nada é commitado.
    await fc.assert(
      fc.asyncProperty(signupInputArb, async (input) => {
        const bundle = makeFakeClient({ failOnQueryContaining: 'INSERT INTO tenants' });
        const { deps, createAuthUser, deleteAuthUser, provisionEvolution } = makeDeps(bundle);

        await expect(provisionTenant(input, deps)).rejects.toBeInstanceOf(ProvisioningError);

        const t = texts(bundle);
        expect(t.some((x) => x.includes('ROLLBACK'))).toBe(true);
        expect(t.some((x) => x.includes('COMMIT'))).toBe(false);
        // A falha ocorre antes de criar o admin e antes do Evolution.
        expect(createAuthUser).not.toHaveBeenCalled();
        expect(deleteAuthUser).not.toHaveBeenCalled();
        expect(provisionEvolution).not.toHaveBeenCalled();
        expect(bundle.wasReleased()).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
