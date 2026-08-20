import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pastelDasMeninasPreset } from '../../presets/pastel-das-meninas.js';
import type {
  OnboardingPreset,
  OnboardingCategory,
  OnboardingMenuItem,
} from '../../services/tenant-provision.service.js';

/**
 * Task 21 — "Pastel das Meninas" onboarding preset.
 *
 * The old global seed migration `010_seed_menu.sql` was removed in task 1; the
 * initial menu is now tenant ONBOARDING DATA (R9.6). These tests assert that the
 * recovered preset — both the typed module and the JSON artifact consumed by the
 * CLI — parses and matches the `OnboardingPreset` shape expected by
 * `provisionTenant`, and that it faithfully reproduces the original MVP menu.
 *
 * **Validates: Requirements 9.6**
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JSON_PRESET_PATH = join(__dirname, '../../../presets/pastel-das-meninas.json');

/** Runtime shape guard for OnboardingPreset (parse + validate). */
function assertOnboardingPresetShape(value: unknown): asserts value is OnboardingPreset {
  expect(value, 'preset must be an object').toBeTypeOf('object');
  expect(value).not.toBeNull();

  const preset = value as Record<string, unknown>;
  expect(Array.isArray(preset.categories), 'categories must be an array').toBe(true);

  const categories = preset.categories as unknown[];
  expect(categories.length, 'preset must have at least one category').toBeGreaterThan(0);

  for (const rawCat of categories) {
    expect(rawCat, 'category must be an object').toBeTypeOf('object');
    const cat = rawCat as Record<string, unknown>;

    expect(typeof cat.name, 'category.name must be a string').toBe('string');
    expect((cat.name as string).trim().length, 'category.name must be non-empty').toBeGreaterThan(0);

    if (cat.sortOrder !== undefined) {
      expect(typeof cat.sortOrder, 'category.sortOrder must be a number when present').toBe('number');
      expect(Number.isInteger(cat.sortOrder as number)).toBe(true);
    }

    expect(Array.isArray(cat.items), 'category.items must be an array').toBe(true);
    const items = cat.items as unknown[];
    expect(items.length, 'category must have at least one item').toBeGreaterThan(0);

    for (const rawItem of items) {
      expect(rawItem, 'item must be an object').toBeTypeOf('object');
      const item = rawItem as Record<string, unknown>;

      expect(typeof item.name, 'item.name must be a string').toBe('string');
      expect((item.name as string).trim().length, 'item.name must be non-empty').toBeGreaterThan(0);

      expect(typeof item.priceCents, 'item.priceCents must be a number').toBe('number');
      expect(Number.isInteger(item.priceCents as number), 'item.priceCents must be an integer').toBe(true);
      expect(item.priceCents as number, 'item.priceCents must be positive').toBeGreaterThan(0);
    }
  }
}

describe('Pastel das Meninas onboarding preset (R9.6)', () => {
  it('the typed preset module matches the OnboardingPreset shape', () => {
    assertOnboardingPresetShape(pastelDasMeninasPreset);
  });

  it('the JSON artifact parses and matches the OnboardingPreset shape', async () => {
    const raw = await readFile(JSON_PRESET_PATH, 'utf-8');

    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(raw);
    }, 'JSON preset must parse').not.toThrow();

    assertOnboardingPresetShape(parsed);
  });

  it('the JSON artifact and the typed module are in sync', async () => {
    const raw = await readFile(JSON_PRESET_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as OnboardingPreset;

    expect(parsed).toEqual(pastelDasMeninasPreset);
  });

  it('reproduces the original MVP menu (categories, items and prices)', () => {
    const byName = new Map<string, OnboardingCategory>(
      pastelDasMeninasPreset.categories.map((c) => [c.name, c]),
    );

    // Three categories, in the original order.
    expect(pastelDasMeninasPreset.categories.map((c) => c.name)).toEqual([
      'Pastéis Salgados',
      'Pastéis Doces',
      'Bebidas',
    ]);

    const priceOf = (cat: string, item: string): number | undefined =>
      byName.get(cat)?.items.find((i: OnboardingMenuItem) => i.name === item)?.priceCents;

    // Salgados
    expect(priceOf('Pastéis Salgados', 'Pastel de Carne')).toBe(750);
    expect(priceOf('Pastéis Salgados', 'Pastel de Queijo')).toBe(700);
    expect(priceOf('Pastéis Salgados', 'Pastel de Frango')).toBe(750);
    expect(priceOf('Pastéis Salgados', 'Pastel de Pizza')).toBe(800);

    // Doces
    expect(priceOf('Pastéis Doces', 'Pastel de Chocolate')).toBe(800);
    expect(priceOf('Pastéis Doces', 'Pastel de Doce de Leite')).toBe(800);

    // Bebidas
    expect(priceOf('Bebidas', 'Caldo de Cana 300ml')).toBe(600);
    expect(priceOf('Bebidas', 'Refrigerante Lata')).toBe(500);
    expect(priceOf('Bebidas', 'Água Mineral')).toBe(300);

    // Total of 9 items across the menu.
    const totalItems = pastelDasMeninasPreset.categories.reduce(
      (sum, c) => sum + c.items.length,
      0,
    );
    expect(totalItems).toBe(9);
  });
});
