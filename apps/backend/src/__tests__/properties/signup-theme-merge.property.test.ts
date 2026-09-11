import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { ThemeConfig } from '@order-system/shared';
import { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '@order-system/shared';

// Mock supabaseAdmin/pool para que importar o serviço (via tenant-provision.service)
// não construa clientes reais no load do módulo (exigiriam env). Os efeitos são
// injetados via `SignupDeps`, então os mocks só precisam existir. Mesmo padrão de
// `signup-service.test.ts`.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import { signup, type SignupDeps } from '../../services/signup.service.js';
import { listColorPresets } from '../../services/color-presets.js';

/**
 * Feature: landing-onboarding, Property 5: Montagem do tema preserva a paleta do
 * preset e o businessName.
 *
 * *Para qualquer* Color_Preset disponível (carregado de `presets/colors/*.json`
 * via `listColorPresets()`) e qualquer `businessName` de cadastro, o `theme`
 * (`Partial<ThemeConfig>`) que o `Signup_Service` repassa ao `provisionTenant`
 * DEVE ter `theme.colors` **igual à paleta completa do preset** e
 * `theme.businessName` **igual ao businessName informado**; e aplicá-lo sobre o
 * `NEUTRAL_PLATFORM_THEME` via `deepMergeTheme` DEVE produzir um tema **completo**
 * cujos tokens de cor são exatamente os do preset (R6.6).
 *
 * O `theme` é capturado interceptando o argumento passado a um `provisionTenant`
 * mockado (injeção de dependência via `SignupDeps`), sem I/O real. O `pool`
 * mockado reporta slug livre e e-mail livre, de modo que o fluxo alcança o
 * provisionamento.
 *
 * **Validates: Requirements 6.6**
 */
describe('Property 5: Montagem do tema preserva a paleta do preset e o businessName', () => {
  beforeEach(() => {
    // O caminho sem logo não usa `uploadLogo`, mas o serviço valida presets e
    // consulta o pool; nenhuma env é necessária no caminho feliz sem logo.
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Presets reais carregados do backend (fonte da verdade, R6.8). Há ao menos um.
  const presets = listColorPresets();

  // Gerador: qualquer preset carregado (classico/vibrante/noturno, ...).
  const anyPreset = fc.constantFrom(...presets);

  // Gerador: businessName arbitrário não vazio (após trim), até 120 chars (R3.2).
  // O serviço não revalida o nome (isso é do schema); qualquer string serve para
  // provar a preservação. Restringimos a algo plausível para robustez.
  const anyBusinessName = fc
    .string({ minLength: 1, maxLength: 120 })
    .filter((s) => s.trim().length > 0);

  it('há ao menos um preset carregado', () => {
    expect(presets.length).toBeGreaterThan(0);
  });

  it('theme.colors = paleta completa do preset e theme.businessName = businessName informado', async () => {
    await fc.assert(
      fc.asyncProperty(anyPreset, anyBusinessName, async (preset, businessName) => {
        let capturedTheme: Partial<ThemeConfig> | undefined;

        const provisionTenant = vi.fn().mockImplementation((arg: { theme: Partial<ThemeConfig> }) => {
          capturedTheme = arg.theme;
          return Promise.resolve({
            tenantId: 'tenant-x',
            adminUserId: 'user-x',
            businessName,
            status: 'ativo' as const,
            idempotentHit: false,
          });
        });

        const deps: Partial<SignupDeps> = {
          // slug livre + e-mail livre ⇒ alcança o provisionamento.
          pool: {
            query: vi.fn().mockResolvedValue({ rows: [] }),
          } as unknown as SignupDeps['pool'],
          provisionTenant,
          uploadLogo: vi.fn(),
        };

        await signup(
          {
            businessName,
            contactName: 'Contato Teste',
            contactPhone: '+5511999991234',
            adminName: 'Admin Teste',
            adminEmail: 'admin@teste.com',
            password: 'senhaForte1',
            slug: 'slug-teste',
            colorPresetId: preset.id,
          },
          deps,
        );

        expect(provisionTenant).toHaveBeenCalledTimes(1);
        expect(capturedTheme).toBeDefined();

        // (a) O theme repassado preserva a paleta completa do preset...
        expect(capturedTheme?.colors).toEqual(preset.colors);
        // ...e o businessName informado no cadastro (R6.6).
        expect(capturedTheme?.businessName).toBe(businessName);

        // (b) Aplicar o override sobre o NEUTRAL_PLATFORM_THEME via deepMergeTheme
        // produz um tema COMPLETO cujos tokens de cor são os do preset.
        const merged = deepMergeTheme(NEUTRAL_PLATFORM_THEME, capturedTheme);

        // Todos os tokens de cor do tema neutro estão presentes no tema mesclado...
        const expectedTokens = Object.keys(NEUTRAL_PLATFORM_THEME.colors).sort();
        expect(Object.keys(merged.colors).sort()).toEqual(expectedTokens);
        // ...e cada token de cor vale exatamente o do preset (o override venceu).
        expect(merged.colors).toEqual(preset.colors);
        // businessName do tema completo é o do cadastro.
        expect(merged.businessName).toBe(businessName);
      }),
      { numRuns: 100 },
    );
  });
});
