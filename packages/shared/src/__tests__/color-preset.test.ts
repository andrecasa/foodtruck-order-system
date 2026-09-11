/**
 * Testes de forma do tipo `ColorPreset` (R6.4). Como `ColorPreset` é um tipo
 * (apagado em runtime), estes testes validam sua forma por **compilação/uso**:
 * um valor tipado como `ColorPreset` só compila se expuser `id`, `label` e a
 * paleta `colors` completa de `ThemeConfig['colors']` — reaproveitando a paleta
 * de `NEUTRAL_PLATFORM_THEME` como fonte da forma. As asserções em runtime
 * apenas confirmam que o valor construído respeita esse contrato.
 */
import { describe, it, expect } from 'vitest';
import type { ColorPreset } from '../types/color-preset';
import { NEUTRAL_PLATFORM_THEME } from '../theme/platform-theme';

// Valor tipado como ColorPreset: só compila se a forma estiver correta (R6.4).
// A paleta vem do tema neutro, garantindo que `colors` é `ThemeConfig['colors']`
// completo — todos os tokens presentes — e sem `businessName` (R6.5).
const preset: ColorPreset = {
  id: 'classico',
  label: 'Clássico',
  colors: NEUTRAL_PLATFORM_THEME.colors,
};

describe('ColorPreset type shape', () => {
  it('expõe id e label como strings', () => {
    expect(typeof preset.id).toBe('string');
    expect(typeof preset.label).toBe('string');
  });

  it('expõe a paleta completa de ThemeConfig["colors"]', () => {
    const expectedTokens = Object.keys(NEUTRAL_PLATFORM_THEME.colors).sort();
    expect(Object.keys(preset.colors).sort()).toEqual(expectedTokens);
  });

  it('não inclui businessName (R6.5)', () => {
    expect('businessName' in preset).toBe(false);
  });

  it('a paleta corresponde a ThemeConfig["colors"] (todos os tokens são strings)', () => {
    for (const value of Object.values(preset.colors)) {
      expect(typeof value).toBe('string');
    }
  });
});
