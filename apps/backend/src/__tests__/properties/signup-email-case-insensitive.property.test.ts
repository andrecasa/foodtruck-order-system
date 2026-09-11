import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock supabaseAdmin para que importar o serviço (via tenant-provision.service)
// não construa um cliente Supabase real no load do módulo (exige env keys).
// Mesmo padrão de `signup-service.test.ts`.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock do pool compartilhado para o módulo carregar sem abrir conexão real; os
// testes injetam seu próprio pool falso via `deps.pool`.
vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import {
  signup,
  type SignupDeps,
  type SignupInputForService,
} from '../../services/signup.service.js';

/**
 * Feature: landing-onboarding, Property 2: E-mail é comparado de forma case-insensitive
 *
 * Para qualquer e-mail, todas as suas variações de caixa (maiúsculas/minúsculas)
 * são tratadas como o mesmo e-mail na verificação de unicidade do cadastro, de
 * modo que um cadastro cujo e-mail já exista (em qualquer caixa) SHALL ser
 * rejeitado com código `CONFLICT` e status 409, sem provisionar o tenant.
 *
 * O `Signup_Service` detecta e-mail em uso via
 * `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`. Aqui o pool mockado
 * replica exatamente essa semântica: normaliza (minúsculas) o parâmetro `$1`
 * recebido e o compara com um e-mail já existente (também normalizado). Como o
 * serviço repassa o e-mail cru do cadastro, o teste prova que QUALQUER variação
 * de caixa do mesmo e-mail colide com o existente e é rejeitada.
 *
 * **Validates: Requirements 3.7**
 */

/** Entrada de cadastro válida base (o adminEmail é sobrescrito por variação de caixa). */
const baseInput: SignupInputForService = {
  businessName: 'Restaurante Teste',
  contactName: 'Maria Responsável',
  contactPhone: '+55 (11) 99999-1234',
  adminName: 'Admin Teste',
  adminEmail: 'placeholder@teste.com',
  password: 'senhaForte1',
  slug: 'restaurante-teste',
  colorPresetId: 'classico',
};

/**
 * Constrói um pool mockado que simula a comparação case-insensitive do SQL:
 * a 1ª query (tenant por slug) retorna vazio (slug livre) e a 2ª query
 * (`LOWER(email) = LOWER($1)`) retorna uma linha sse o `$1` recebido, em
 * minúsculas, for igual ao `existingEmail` já cadastrado (também em minúsculas).
 */
function makeEmailAwarePool(existingEmail: string): {
  pool: SignupDeps['pool'];
  emailQueryCalls: () => string[];
} {
  const existingNormalized = existingEmail.toLowerCase();
  const emailParams: string[] = [];

  const query = vi.fn(async (text: string, params?: unknown[]) => {
    // Consulta de e-mail em uso: replica LOWER(email) = LOWER($1).
    if (/FROM users WHERE LOWER\(email\)/i.test(text)) {
      const param = String(params?.[0] ?? '');
      emailParams.push(param);
      const matches = param.toLowerCase() === existingNormalized;
      return { rows: matches ? [{ id: 'existing-user' }] : [] };
    }
    // Qualquer outra query (tenant por slug etc.): slug livre / sem linhas.
    return { rows: [] };
  });

  return {
    pool: { query } as unknown as SignupDeps['pool'],
    emailQueryCalls: () => emailParams,
  };
}

/**
 * Gera variações de caixa de um mesmo endereço de e-mail: um local-part e um
 * domínio compostos por letras (onde a caixa é significativa para o teste), e
 * uma "semente de caixa" que decide, por caractere, maiúscula/minúscula. Assim
 * cobrimos desde tudo-minúsculo até tudo-maiúsculo e combinações no meio.
 */
const emailCaseVariantArb = fc
  .record({
    local: fc.stringMatching(/^[a-z]{1,20}$/),
    domain: fc.stringMatching(/^[a-z]{1,15}$/),
    tld: fc.constantFrom('com', 'br', 'net', 'org', 'io'),
    upperFlags: fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
  })
  .map(({ local, domain, tld, upperFlags }) => {
    const canonical = `${local}@${domain}.${tld}`;
    // Aplica a variação de caixa caractere a caractere (ignorando os não-letras).
    let flagIndex = 0;
    const variant = Array.from(canonical)
      .map((ch) => {
        if (!/[a-z]/i.test(ch)) return ch;
        const upper = upperFlags[flagIndex % upperFlags.length];
        flagIndex += 1;
        return upper ? ch.toUpperCase() : ch.toLowerCase();
      })
      .join('');
    return { canonical, variant };
  });

describe('Feature: landing-onboarding, Property 2: E-mail é comparado de forma case-insensitive', () => {
  beforeEach(() => {
    process.env.ASSETS_S3_BUCKET = 'assets-test';
    process.env.ASSETS_PUBLIC_BASE_URL = 'https://foodtruck.app.br';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ASSETS_S3_BUCKET;
    delete process.env.ASSETS_PUBLIC_BASE_URL;
  });

  it('rejeita com 409 CONFLICT qualquer variação de caixa de um e-mail já cadastrado, sem provisionar', async () => {
    await fc.assert(
      fc.asyncProperty(emailCaseVariantArb, async ({ canonical, variant }) => {
        // O e-mail já existe cadastrado em uma caixa (a canônica minúscula); o
        // cadastro chega com uma variação de caixa arbitrária do MESMO e-mail.
        const { pool } = makeEmailAwarePool(canonical);
        const provisionTenant = vi.fn();
        const uploadLogo = vi.fn();
        const deps: Partial<SignupDeps> = { pool, provisionTenant, uploadLogo };

        const err = await signup({ ...baseInput, adminEmail: variant }, deps).catch(
          (e) => e as { statusCode?: number; code?: string },
        );

        // Deve ser rejeitado como conflito (R3.7), independentemente da caixa.
        expect(err?.statusCode).toBe(409);
        expect(err?.code).toBe('CONFLICT');

        // Nenhum efeito colateral: não provisiona nem sobe logo.
        expect(provisionTenant).not.toHaveBeenCalled();
        expect(uploadLogo).not.toHaveBeenCalled();
      }),
      { numRuns: 150 },
    );
  });

  it('aceita (não conflita) um e-mail cuja versão normalizada difere do existente', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailCaseVariantArb,
        fc.stringMatching(/^[a-z]{1,20}$/),
        async ({ canonical }, distinctLocal) => {
          // Garante um e-mail cujo LOWER difere do existente (local distinto).
          const differentEmail = `${distinctLocal}.diferente@outro-dominio.com`;
          fc.pre(differentEmail.toLowerCase() !== canonical.toLowerCase());

          const provisionTenant = vi.fn().mockResolvedValue({
            tenantId: 'tenant-novo',
            adminUserId: 'user-1',
            businessName: baseInput.businessName,
            status: 'ativo',
            idempotentHit: false,
          });
          const { pool } = makeEmailAwarePool(canonical);
          const deps: Partial<SignupDeps> = { pool, provisionTenant, uploadLogo: vi.fn() };

          const result = await signup({ ...baseInput, adminEmail: differentEmail }, deps);

          // E-mail distinto ⇒ sem conflito, o cadastro segue e provisiona.
          expect(result.tenantId).toBe('tenant-novo');
          expect(provisionTenant).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
