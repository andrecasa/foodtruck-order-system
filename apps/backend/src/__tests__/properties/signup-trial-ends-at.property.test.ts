import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock supabaseAdmin para que importar o serviço (via tenant-provision.service)
// não construa um cliente Supabase real no load do módulo (exige env keys). Os
// efeitos de auth são injetados via deps, então o mock só precisa existir.
// Mesmo padrão de `signup-service.test.ts` / `tenant-provision.test.ts`.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock do pool compartilhado para o módulo carregar sem abrir conexão real; o
// teste injeta seu próprio pool falso via `deps.pool`.
vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import {
  signup,
  type SignupDeps,
  type SignupInputForService,
} from '../../services/signup.service.js';

/**
 * Feature: landing-onboarding, Property 12: Cálculo do fim do teste.
 *
 * Para qualquer instante de cadastro `now`, o `trial_ends_at` registrado para um
 * tenant novo SHALL ser igual a `now` acrescido de 30 dias corridos
 * (30 * 24 * 60 * 60 * 1000 ms). Verificamos tanto o `trialEndsAt` que o
 * `Signup_Service` repassa ao `provisionTenant` quanto o `SignupResult.trialEndsAt`
 * devolvido ao controller.
 *
 * O relógio é fixado com fake timers em instantes arbitrários; as dependências
 * com efeito colateral (upload S3, provisionamento e pool) são injetadas via
 * `SignupDeps`, exercitando o cálculo SEM I/O real. O cenário é sempre de tenant
 * NOVO (slug livre + e-mail livre), no qual o serviço computa o trial do zero.
 *
 * **Validates: Requirements 11.1**
 */
describe('Property 12: Cálculo do fim do teste (trial_ends_at = now + 30d)', () => {
  /** 30 dias corridos em milissegundos (mesma constante do serviço). */
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  /** Entrada de cadastro válida base (tenant novo). */
  const baseInput: SignupInputForService = {
    businessName: 'Restaurante Teste',
    contactName: 'Maria Responsável',
    contactPhone: '+55 (11) 99999-1234',
    adminName: 'Admin Teste',
    adminEmail: 'admin@teste.com',
    password: 'senhaForte1',
    slug: 'restaurante-teste',
    colorPresetId: 'classico',
  };

  beforeEach(() => {
    process.env.ASSETS_S3_BUCKET = 'assets-test';
    process.env.ASSETS_PUBLIC_BASE_URL = 'https://foodtruck.app.br';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete process.env.ASSETS_S3_BUCKET;
    delete process.env.ASSETS_PUBLIC_BASE_URL;
  });

  /**
   * Generator: instante de cadastro arbitrário (epoch ms) numa janela ampla e
   * realista (2020–2100), evitando extremos que estourariam a aritmética de Date.
   */
  const signupInstantArb = fc.integer({
    min: Date.UTC(2020, 0, 1),
    max: Date.UTC(2100, 0, 1),
  });

  it('registra trial_ends_at = now + 30 dias para um tenant novo, em qualquer instante', async () => {
    await fc.assert(
      fc.asyncProperty(signupInstantArb, async (nowMs) => {
        // Fixa o relógio no instante de cadastro sorteado. Fake timers do Vitest
        // não interceptam microtasks, então os `await` das promises mockadas
        // continuam resolvendo normalmente sob o relógio fixo.
        vi.useFakeTimers();
        vi.setSystemTime(new Date(nowMs));

        try {
          // Pool: slug livre (1ª query) e e-mail livre (2ª query) ⇒ tenant novo.
          const query = vi.fn().mockResolvedValue({ rows: [] });

          // provisionTenant mockado: apenas ecoa o resultado; o `trialEndsAt`
          // recebido fica registrado em `mock.calls` para asserção.
          const provisionTenant = vi.fn().mockResolvedValue({
            tenantId: 'tenant-novo',
            adminUserId: 'user-1',
            businessName: baseInput.businessName,
            status: 'ativo',
            idempotentHit: false,
          });

          const deps: Partial<SignupDeps> = {
            pool: { query } as unknown as SignupDeps['pool'],
            provisionTenant,
            uploadLogo: vi.fn(),
          };

          const result = await signup(baseInput, deps);

          const expected = nowMs + THIRTY_DAYS_MS;

          // 1. trialEndsAt repassado ao provisionTenant = now + 30d.
          expect(provisionTenant).toHaveBeenCalledTimes(1);
          const passedTrial = provisionTenant.mock.calls[0]![0].trialEndsAt as Date;
          expect(passedTrial).toBeInstanceOf(Date);
          expect(passedTrial.getTime()).toBe(expected);

          // 2. trialEndsAt devolvido no SignupResult (tenant novo) = now + 30d.
          expect(result.trialEndsAt.getTime()).toBe(expected);
          expect(result.idempotentHit).toBe(false);
        } finally {
          // Restaura o relógio real entre execuções da propriedade.
          vi.useRealTimers();
          vi.clearAllMocks();
        }
      }),
      { numRuns: 200 },
    );
  });
});
