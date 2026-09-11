import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock supabaseAdmin para que importar o serviço não construa um cliente
// Supabase real no load do módulo (exige chaves de env). Todos os efeitos de
// auth são injetados via `deps`, então o mock só precisa existir.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock do pool compartilhado para carregar o módulo sem abrir conexão real.
// Os testes injetam seu próprio pool falso via `deps.pool`.
vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn() },
}));

import {
  provisionTenant,
  type ProvisionTenantInput,
  type ProvisionDeps,
} from '../../services/tenant-provision.service.js';

/**
 * Teste de propriedade para a idempotência do provisionamento (fluxo de
 * onboarding self-service, PLATFORM-LEVEL), em
 * `services/tenant-provision.service.ts`.
 *
 * Feature: landing-onboarding, Property 11: Provisionamento é idempotente e
 *   preserva o trial.
 *   Para qualquer entrada de cadastro, chamar o provisionamento DUAS vezes com
 *   o mesmo `provisioningKey` (slug) deve retornar o MESMO `tenantId` sem criar
 *   um segundo tenant, e o segundo resultado (idempotente) deve PRESERVAR o
 *   `trial_ends_at` e o Contato_Comercial já registrados na criação, sem
 *   reiniciá-los nem sobrescrevê-los.
 *
 * Validates: Requirements 10.4, 11.3
 *
 * O pool/cliente é injetado via `deps.pool.connect` sobre um "banco" em memória
 * (Map por `provisioning_key`), de modo que a propriedade é verificada SEM
 * qualquer I/O real. A preservação é asserida em dois níveis: (1) a segunda
 * chamada NÃO emite `INSERT INTO tenants` nem qualquer `UPDATE`; (2) a linha
 * armazenada (incluindo `trial_ends_at`/contato gravados na criação) permanece
 * byte-a-byte idêntica após a chamada idempotente.
 */

interface RecordedQuery {
  text: string;
  params?: unknown[];
}

/** Linha de tenant como persistida na criação, incluindo os campos de trial/contato. */
interface StoredTenant {
  id: string;
  business_name: string;
  status: string;
  trial_ends_at: unknown;
  subscription_status: unknown;
  contact_name: unknown;
  contact_phone: unknown;
}

/**
 * Cria um "banco" em memória compartilhado entre múltiplas conexões: um Map
 * indexado pelo `provisioning_key`. A primeira chamada com uma chave insere; as
 * seguintes encontram o tenant existente (caminho idempotente).
 */
function makeSharedDb() {
  const store = new Map<string, StoredTenant>();
  const allQueries: RecordedQuery[] = [];
  let insertCount = 0;

  function connect() {
    const queries: RecordedQuery[] = [];
    const client = {
      async query(text: string, params?: unknown[]) {
        const rec = { text, params };
        queries.push(rec);
        allQueries.push(rec);

        // Lookup de idempotência por provisioning_key ($1).
        if (/SELECT .*FROM tenants WHERE provisioning_key/i.test(text)) {
          const existing = store.get(params?.[0] as string);
          return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
        }
        // Lookup do admin de um tenant existente.
        if (/SELECT id FROM users WHERE tenant_id/i.test(text)) {
          return { rows: [{ id: 'admin-x' }], rowCount: 1 };
        }
        // INSERT do tenant: grava a linha com os campos de trial/contato
        // exatamente como recebidos nos parâmetros ($7 = provisioning_key,
        // $8 = trial_ends_at, $9 = subscription_status, $10 = contact_name,
        // $11 = contact_phone).
        if (/INSERT INTO tenants/i.test(text)) {
          insertCount += 1;
          const id = `tenant-${insertCount}`;
          const row: StoredTenant = {
            id,
            business_name: params?.[0] as string,
            status: 'ativo',
            trial_ends_at: params?.[7] ?? null,
            subscription_status: params?.[8] ?? 'trial',
            contact_name: params?.[9] ?? null,
            contact_phone: params?.[10] ?? null,
          };
          store.set(params?.[6] as string, row);
          return { rows: [{ id, business_name: row.business_name, status: row.status }], rowCount: 1 };
        }
        if (/INSERT INTO categories/i.test(text)) {
          return { rows: [{ id: `cat-${queries.length}` }], rowCount: 1 };
        }
        // BEGIN/COMMIT/ROLLBACK, menu_items, users insert, etc.
        return { rows: [], rowCount: 0 };
      },
      release() {},
    };
    return client;
  }

  return {
    store,
    allQueries,
    getInsertCount: () => insertCount,
    deps(): Partial<ProvisionDeps> {
      return {
        createAuthUser: vi.fn(async () => 'auth-user'),
        deleteAuthUser: vi.fn(async () => {}),
        provisionEvolution: vi.fn(async () => {}),
        webhookBaseUrl: 'https://api.example.com',
        pool: { connect: async () => connect() as never },
      };
    },
  };
}

/** Entrada de cadastro válida, parametrizada por chave, trial e contato. */
function makeInput(overrides: Partial<ProvisionTenantInput> = {}): ProvisionTenantInput {
  return {
    provisioningKey: 'meu-negocio',
    businessName: 'Meu Negócio',
    evolutionInstanceName: 'meu-negocio',
    admin: { name: 'Admin', email: 'admin@negocio.com', password: 'Sup3rSecret!' },
    menuPreset: {
      categories: [{ name: 'Salgados', items: [{ name: 'Pastel', priceCents: 900 }] }],
    },
    ...overrides,
  };
}

/**
 * Slug bem-formado (formato exigido para tenant novo: 3–60 chars, [a-z0-9-],
 * sem hífen no início/fim). Evita palavras reservadas usando um sufixo fixo.
 */
const slugArb: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-z0-9]+$/).filter((s) => s.length >= 1 && s.length <= 10), {
    minLength: 1,
    maxLength: 3,
  })
  .map((parts) => `t-${parts.join('-')}`)
  .filter((s) => s.length >= 3 && s.length <= 60);

/**
 * Instante de expiração do trial (Trial_Ends_At) como ISO string. Gerado a
 * partir de um timestamp inteiro (em ms) para evitar `Invalid Date` nas bordas
 * que `fc.date` pode produzir.
 */
const trialEndsAtArb: fc.Arbitrary<string> = fc
  .integer({
    min: new Date('2024-01-01T00:00:00.000Z').getTime(),
    max: new Date('2030-12-31T23:59:59.000Z').getTime(),
  })
  .map((ms) => new Date(ms).toISOString());

/** Contato_Comercial: nome do responsável + telefone/WhatsApp. */
const contactArb: fc.Arbitrary<{ name: string; phone: string }> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== ''),
  phone: fc.stringMatching(/^\+?[1-9][0-9]{9,14}$/),
});

describe('Feature: landing-onboarding, Property 11: Provisionamento é idempotente e preserva o trial', () => {
  it('duas chamadas com o mesmo provisioningKey retornam o mesmo tenantId, sem 2º INSERT nem UPDATE, preservando trial e contato', async () => {
    await fc.assert(
      fc.asyncProperty(
        slugArb,
        trialEndsAtArb,
        contactArb,
        fc.constantFrom<'trial' | 'active' | 'canceled'>('trial', 'active', 'canceled'),
        async (slug, trialEndsAt, contact, subscriptionStatus) => {
          const db = makeSharedDb();
          const deps = db.deps();

          const input = makeInput({
            provisioningKey: slug,
            evolutionInstanceName: slug,
            trialEndsAt,
            contact,
            subscriptionStatus,
          });

          // 1ª chamada: cria o tenant e grava trial/contato.
          const first = await provisionTenant(input, deps);
          expect(first.idempotentHit).toBe(false);
          expect(db.getInsertCount()).toBe(1);

          // Snapshot da linha gravada na criação (cópia rasa para detectar mutação).
          const created = db.store.get(slug);
          expect(created).toBeDefined();
          const snapshot = { ...(created as StoredTenant) };
          const queriesBeforeSecond = db.allQueries.length;

          // 2ª chamada com o MESMO slug: caminho idempotente.
          const second = await provisionTenant(input, deps);

          // Mesmo tenantId, marcado como idempotente, sem 2º INSERT.
          expect(second.idempotentHit).toBe(true);
          expect(second.tenantId).toBe(first.tenantId);
          expect(db.getInsertCount()).toBe(1);

          // A 2ª chamada NÃO emitiu INSERT INTO tenants nem qualquer UPDATE.
          const secondCallQueries = db.allQueries.slice(queriesBeforeSecond);
          expect(secondCallQueries.some((q) => /INSERT INTO tenants/i.test(q.text))).toBe(false);
          expect(secondCallQueries.some((q) => /\bUPDATE\b/i.test(q.text))).toBe(false);
          // O caminho idempotente confirma a transação (COMMIT), sem ROLLBACK.
          expect(secondCallQueries.some((q) => /COMMIT/.test(q.text))).toBe(true);
          expect(secondCallQueries.some((q) => /ROLLBACK/.test(q.text))).toBe(false);

          // trial_ends_at e Contato_Comercial preservados byte-a-byte (R10.4, R11.3).
          const after = db.store.get(slug) as StoredTenant;
          expect(after.trial_ends_at).toBe(snapshot.trial_ends_at);
          expect(after.trial_ends_at).toBe(trialEndsAt);
          expect(after.subscription_status).toBe(snapshot.subscription_status);
          expect(after.contact_name).toBe(snapshot.contact_name);
          expect(after.contact_name).toBe(contact.name);
          expect(after.contact_phone).toBe(snapshot.contact_phone);
          expect(after.contact_phone).toBe(contact.phone);
        },
      ),
      { numRuns: 150 },
    );
  });

  it('N chamadas repetidas preservam o trial/contato original (nunca reiniciados)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 6 }),
        trialEndsAtArb,
        contactArb,
        async (n, trialEndsAt, contact) => {
          const db = makeSharedDb();
          const deps = db.deps();
          const slug = 'tenant-repetido';

          const input = makeInput({
            provisioningKey: slug,
            evolutionInstanceName: slug,
            trialEndsAt,
            contact,
          });

          let firstTenantId = '';
          for (let i = 0; i < n; i++) {
            const result = await provisionTenant(input, deps);
            if (i === 0) {
              firstTenantId = result.tenantId;
              expect(result.idempotentHit).toBe(false);
            } else {
              // Sempre o mesmo tenant, sempre idempotente.
              expect(result.idempotentHit).toBe(true);
              expect(result.tenantId).toBe(firstTenantId);
            }
          }

          // Exatamente um INSERT ao todo, e a linha mantém o trial/contato originais.
          expect(db.getInsertCount()).toBe(1);
          const row = db.store.get(slug) as StoredTenant;
          expect(row.trial_ends_at).toBe(trialEndsAt);
          expect(row.contact_name).toBe(contact.name);
          expect(row.contact_phone).toBe(contact.phone);
        },
      ),
      { numRuns: 100 },
    );
  });
});
