/**
 * Loader de Color_Presets (presets de CORES do onboarding).
 *
 * O backend é a **fonte da verdade** dos presets de cores disponíveis (R6.8): os
 * arquivos `apps/backend/presets/colors/*.json` são lidos, validados e expostos
 * pelo `Presets_Endpoint` (`GET /api/signup/color-presets`) e consumidos pelo
 * `Signup_Service` ao montar o `theme` do tenant.
 *
 * Cada arquivo é validado com um schema Zod que exige a paleta `colors.*`
 * **completa** — todos os tokens de `ThemeConfig['colors']` (R6.4), sem depender
 * do `NEUTRAL_PLATFORM_THEME` para preencher omissões — e que **não** contenha
 * `businessName` (R6.5), pois este é fornecido pelo usuário no cadastro. Um preset
 * malformado (token de cor faltando, `businessName` presente, ou campo extra)
 * falha a validação e é reportado como `ServiceError` 500 `INTERNAL_ERROR`, sem
 * vazar detalhes internos ao cliente — presets são artefatos do próprio backend.
 *
 * Os presets são carregados e validados **uma única vez** na primeira chamada
 * (cache em memória), seguindo o padrão dos demais presets do backend.
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (Components — `color-presets.ts`).
 * Requirements: 6.1, 6.4, 6.5, 6.8.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ColorPreset } from '@order-system/shared';
import { z } from 'zod';

import { ServiceError } from './service-error.js';

/** Reexporta a `ServiceError` central para consumidores deste módulo. */
export { ServiceError };

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Diretório dos arquivos de preset de cores (fonte da verdade, R6.8). */
const COLOR_PRESETS_DIR = join(__dirname, '../../presets/colors');

/**
 * Schema da paleta `colors.*` exigindo **todos** os tokens de `ThemeConfig`
 * (R6.4). Cada token é uma string não vazia. `.strict()` rejeita tokens de cor
 * desconhecidos, mantendo a paleta exatamente alinhada ao `ThemeConfig`.
 */
const colorsSchema = z
  .object({
    primary: z.string().min(1),
    secondary: z.string().min(1),
    background: z.string().min(1),
    text: z.string().min(1),
    success: z.string().min(1),
    warning: z.string().min(1),
    error: z.string().min(1),
    aguardando: z.string().min(1),
    preparando: z.string().min(1),
    pronto: z.string().min(1),
    entregue: z.string().min(1),
    textSecondary: z.string().min(1),
    surface: z.string().min(1),
    divider: z.string().min(1),
    border: z.string().min(1),
    surfaceDisabled: z.string().min(1),
    textDisabled: z.string().min(1),
    received: z.string().min(1),
    pending: z.string().min(1),
    revenue: z.string().min(1),
    surfacePrimary: z.string().min(1),
    surfaceRevenue: z.string().min(1),
    surfaceReceived: z.string().min(1),
    surfacePending: z.string().min(1),
  })
  .strict();

/**
 * Schema de um Color_Preset. `.strict()` garante a ausência de `businessName`
 * (R6.5) e de quaisquer outros campos não previstos.
 */
const colorPresetSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    colors: colorsSchema,
  })
  .strict() satisfies z.ZodType<ColorPreset>;

/** Cache dos presets carregados/validados (indexados por id, na ordem de leitura). */
let cachedPresets: ColorPreset[] | null = null;

/**
 * Lê e valida todos os presets de cores do diretório, populando o cache. Falha
 * com `ServiceError` 500 se o diretório não puder ser lido ou se algum arquivo
 * for inválido (token faltando, `businessName` presente, campo extra, JSON
 * inválido). Presets são artefatos do backend, portanto uma inconsistência aqui
 * é um erro interno, não de entrada do cliente.
 */
function loadPresets(): ColorPreset[] {
  let files: string[];
  try {
    files = readdirSync(COLOR_PRESETS_DIR).filter((name) => name.endsWith('.json'));
  } catch {
    throw new ServiceError(
      'Não foi possível carregar os presets de cores.',
      500,
      'INTERNAL_ERROR',
    );
  }

  const presets: ColorPreset[] = [];
  const seenIds = new Set<string>();

  for (const file of files.sort()) {
    const path = join(COLOR_PRESETS_DIR, file);

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      throw new ServiceError(
        `Preset de cores inválido: ${file}.`,
        500,
        'INTERNAL_ERROR',
      );
    }

    const parsed = colorPresetSchema.safeParse(raw);
    if (!parsed.success) {
      throw new ServiceError(
        `Preset de cores inválido: ${file}.`,
        500,
        'INTERNAL_ERROR',
      );
    }

    if (seenIds.has(parsed.data.id)) {
      throw new ServiceError(
        `Preset de cores duplicado: ${parsed.data.id}.`,
        500,
        'INTERNAL_ERROR',
      );
    }
    seenIds.add(parsed.data.id);
    presets.push(parsed.data);
  }

  return presets;
}

/** Retorna os presets carregados, populando o cache na primeira chamada. */
function getPresets(): ColorPreset[] {
  if (cachedPresets === null) {
    cachedPresets = loadPresets();
  }
  return cachedPresets;
}

/**
 * Lista todos os Color_Presets disponíveis (R6.1), cada um com `id`, `label` e a
 * paleta `colors` completa. O backend é a fonte da verdade (R6.8).
 */
export function listColorPresets(): ColorPreset[] {
  return getPresets();
}

/**
 * Retorna o Color_Preset de `id` informado, ou `undefined` se não existir. Cabe
 * ao chamador (ex.: `Signup_Service`) decidir como tratar a ausência — no
 * cadastro, um preset inexistente é rejeitado com `VALIDATION_ERROR` 422 (R6.3).
 */
export function getColorPreset(id: string): ColorPreset | undefined {
  return getPresets().find((preset) => preset.id === id);
}
