import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { genericMenuPreset } from '../../presets/generic-menu.js';
import type {
  OnboardingPreset,
  OnboardingCategory,
  OnboardingMenuItem,
} from '../../services/tenant-provision.service.js';

/**
 * Tarefa 4.1 — cardápio genérico único do onboarding.
 *
 * O cadastro self-service aplica um Onboarding_Preset genérico único a todos os
 * novos tenants como `menuPreset` (R6.7). Estes testes asseguram que o preset —
 * tanto o módulo tipado quanto o artefato JSON consumido pelo CLI — parseia e
 * corresponde ao formato `OnboardingPreset` esperado por `provisionTenant`, e que
 * o par `.ts`/`.json` permanece em sincronia (mesmo padrão de `pastel-das-meninas`).
 *
 * **Validates: Requirements 6.7**
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JSON_PRESET_PATH = join(__dirname, '../../../presets/generic-menu.json');

/** Guarda de formato em runtime para OnboardingPreset (parse + validação). */
function assertOnboardingPresetShape(value: unknown): asserts value is OnboardingPreset {
  expect(value, 'preset deve ser um objeto').toBeTypeOf('object');
  expect(value).not.toBeNull();

  const preset = value as Record<string, unknown>;
  expect(Array.isArray(preset.categories), 'categories deve ser um array').toBe(true);

  const categories = preset.categories as unknown[];
  expect(categories.length, 'preset deve ter ao menos uma categoria').toBeGreaterThan(0);

  for (const rawCat of categories) {
    expect(rawCat, 'category deve ser um objeto').toBeTypeOf('object');
    const cat = rawCat as Record<string, unknown>;

    expect(typeof cat.name, 'category.name deve ser string').toBe('string');
    expect((cat.name as string).trim().length, 'category.name não pode ser vazio').toBeGreaterThan(0);

    if (cat.sortOrder !== undefined) {
      expect(typeof cat.sortOrder, 'category.sortOrder deve ser número quando presente').toBe('number');
      expect(Number.isInteger(cat.sortOrder as number)).toBe(true);
    }

    expect(Array.isArray(cat.items), 'category.items deve ser um array').toBe(true);
    const items = cat.items as unknown[];
    expect(items.length, 'category deve ter ao menos um item').toBeGreaterThan(0);

    for (const rawItem of items) {
      expect(rawItem, 'item deve ser um objeto').toBeTypeOf('object');
      const item = rawItem as Record<string, unknown>;

      expect(typeof item.name, 'item.name deve ser string').toBe('string');
      expect((item.name as string).trim().length, 'item.name não pode ser vazio').toBeGreaterThan(0);

      expect(typeof item.priceCents, 'item.priceCents deve ser número').toBe('number');
      expect(Number.isInteger(item.priceCents as number), 'item.priceCents deve ser inteiro').toBe(true);
      expect(item.priceCents as number, 'item.priceCents deve ser positivo').toBeGreaterThan(0);
    }
  }
}

describe('preset de cardápio genérico do onboarding (R6.7)', () => {
  it('o módulo tipado corresponde ao formato OnboardingPreset', () => {
    assertOnboardingPresetShape(genericMenuPreset);
  });

  it('o artefato JSON parseia e corresponde ao formato OnboardingPreset', async () => {
    const raw = await readFile(JSON_PRESET_PATH, 'utf-8');

    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(raw);
    }, 'o preset JSON deve parsear').not.toThrow();

    assertOnboardingPresetShape(parsed);
  });

  it('o artefato JSON e o módulo tipado estão em sincronia', async () => {
    const raw = await readFile(JSON_PRESET_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as OnboardingPreset;

    expect(parsed).toEqual(genericMenuPreset);
  });

  it('é um cardápio genérico com categorias, itens e preços consistentes', () => {
    const byName = new Map<string, OnboardingCategory>(
      genericMenuPreset.categories.map((c) => [c.name, c]),
    );

    // sortOrder é único e sequencial a partir de 1.
    const sortOrders = genericMenuPreset.categories.map((c) => c.sortOrder);
    expect(sortOrders).toEqual([1, 2, 3, 4]);

    // Todo item tem preço positivo.
    for (const cat of genericMenuPreset.categories) {
      for (const item of cat.items as OnboardingMenuItem[]) {
        expect(item.priceCents).toBeGreaterThan(0);
      }
    }

    // As categorias esperadas existem.
    expect([...byName.keys()]).toEqual([
      'Entradas',
      'Pratos Principais',
      'Sobremesas',
      'Bebidas',
    ]);
  });
});
