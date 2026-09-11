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
  ServiceError,
  type SignupDeps,
  type SignupInputForService,
} from '../../services/signup.service.js';
import { listColorPresets } from '../../services/color-presets.js';

/**
 * Feature: landing-onboarding, Property 7: Preset de cores inexistente é
 * rejeitado.
 *
 * Para qualquer `colorPresetId` que NÃO corresponda a um preset de cores
 * carregado (ver `presets/colors/*.json` — hoje `classico`, `vibrante`,
 * `noturno`), o `Signup_Service` SHALL rejeitar o cadastro com uma `ServiceError`
 * de código `VALIDATION_ERROR` e status 422 (R6.3), ANTES de qualquer efeito
 * colateral: nem `uploadLogo` nem `provisionTenant` devem ser chamados. As
 * dependências com efeito colateral são injetadas via `SignupDeps`, de modo que
 * a propriedade é exercitada sem I/O real.
 *
 * **Validates: Requirements 6.3**
 */

/** Entrada de cadastro válida base; só o `colorPresetId` varia por execução. */
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

/** Ids reais dos presets carregados — excluídos do gerador (fonte da verdade). */
const KNOWN_PRESET_IDS = new Set(listColorPresets().map((preset) => preset.id));

/**
 * Gera `colorPresetId` arbitrários que NÃO são um preset conhecido: strings
 * quaisquer, incluindo o caso vazio, filtrando os ids reais.
 */
const unknownPresetIdArb = fc
  .oneof(fc.constant(''), fc.string({ minLength: 1, maxLength: 40 }))
  .filter((id) => !KNOWN_PRESET_IDS.has(id));

describe('Feature: landing-onboarding, Property 7: Preset de cores inexistente é rejeitado', () => {
  beforeEach(() => {
    process.env.ASSETS_S3_BUCKET = 'assets-test';
    process.env.ASSETS_PUBLIC_BASE_URL = 'https://foodtruck.app.br';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ASSETS_S3_BUCKET;
    delete process.env.ASSETS_PUBLIC_BASE_URL;
  });

  it('rejeita colorPresetId inexistente com 422 VALIDATION_ERROR e sem efeitos colaterais', async () => {
    await fc.assert(
      fc.asyncProperty(unknownPresetIdArb, async (colorPresetId) => {
        const provisionTenant = vi.fn();
        const uploadLogo = vi.fn();
        // Pool que falharia se consultado — a rejeição por preset ocorre antes de
        // qualquer acesso a dados, então nenhuma query deve ser disparada.
        const query = vi.fn().mockRejectedValue(new Error('pool não deve ser consultado'));
        const deps: Partial<SignupDeps> = {
          provisionTenant,
          uploadLogo,
          pool: { query } as unknown as SignupDeps['pool'],
        };

        const error = await signup({ ...baseInput, colorPresetId }, deps).catch(
          (e) => e as ServiceError,
        );

        expect(error).toBeInstanceOf(ServiceError);
        expect(error.statusCode).toBe(422);
        expect(error.code).toBe('VALIDATION_ERROR');

        // Nenhum efeito colateral: preset inválido é a primeira barreira (R6.3).
        expect(provisionTenant).not.toHaveBeenCalled();
        expect(uploadLogo).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
