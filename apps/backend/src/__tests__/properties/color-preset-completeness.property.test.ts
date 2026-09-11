import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { NEUTRAL_PLATFORM_THEME } from '@order-system/shared';
import { listColorPresets } from '../../services/color-presets.js';

/**
 * Feature: landing-onboarding, Property 6: Todo Color_Preset expõe paleta de
 * cores completa e sem businessName.
 *
 * *Para qualquer* Color_Preset carregado a partir de `presets/colors/*.json`
 * (via `listColorPresets()`), ele DEVE conter **todos** os tokens de
 * `ThemeConfig.colors` — nenhum omitido e nenhum a mais — usando as chaves de
 * `NEUTRAL_PLATFORM_THEME.colors` como fonte da verdade do conjunto completo de
 * tokens (R6.1, R6.4), e NÃO DEVE conter o campo `businessName` (R6.5), que é
 * fornecido pelo usuário no cadastro.
 *
 * **Validates: Requirements 6.1, 6.4, 6.5**
 */
describe('Property 6: Todo Color_Preset expõe paleta de cores completa e sem businessName', () => {
  // Conjunto completo de tokens de cor de ThemeConfig, ordenado, como fonte da verdade.
  const expectedColorTokens = Object.keys(NEUTRAL_PLATFORM_THEME.colors).sort();

  // Presets carregados a partir de presets/colors/*.json (backend como fonte da verdade).
  const presets = listColorPresets();

  // Gerador: qualquer preset carregado. Há ao menos um preset (classico.json).
  const anyPreset = fc.constantFrom(...presets);

  it('há ao menos um preset carregado', () => {
    expect(presets.length).toBeGreaterThan(0);
  });

  it('todo preset expõe exatamente os tokens de ThemeConfig.colors (nenhum omitido, nenhum extra)', () => {
    fc.assert(
      fc.property(anyPreset, (preset) => {
        const presetTokens = Object.keys(preset.colors).sort();
        expect(presetTokens).toEqual(expectedColorTokens);
      }),
      { numRuns: 100 },
    );
  });

  it('todo preset tem cada token de cor como string não vazia', () => {
    fc.assert(
      fc.property(anyPreset, (preset) => {
        for (const token of expectedColorTokens) {
          const value = (preset.colors as Record<string, unknown>)[token];
          expect(typeof value).toBe('string');
          expect((value as string).length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('nenhum preset contém o campo businessName', () => {
    fc.assert(
      fc.property(anyPreset, (preset) => {
        // businessName não pode estar no preset nem aninhado em colors (R6.5).
        expect(Object.prototype.hasOwnProperty.call(preset, 'businessName')).toBe(false);
        expect(
          Object.prototype.hasOwnProperty.call(preset.colors, 'businessName'),
        ).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('todo preset expõe id e label como strings não vazias', () => {
    fc.assert(
      fc.property(anyPreset, (preset) => {
        expect(typeof preset.id).toBe('string');
        expect(preset.id.length).toBeGreaterThan(0);
        expect(typeof preset.label).toBe('string');
        expect(preset.label.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
