import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  signupSchema,
  MAX_LOGO_BYTES,
  ALLOWED_LOGO_MIME_TYPES,
} from '../../validation/signup.validation.js';

/**
 * Feature: landing-onboarding, Property 9: Logo maior que o limite é rejeitada
 *
 * Para qualquer Logo_Upload cujo tamanho exceda `MAX_LOGO_BYTES` (2 MB), o
 * `signupSchema` SHALL rejeitar o cadastro com mensagem pt-BR indicando o
 * tamanho máximo, de modo que a logo não chegue a ser persistida nem o tenant
 * criado. Complementarmente, para tamanho ≤ `MAX_LOGO_BYTES` (com os demais
 * campos válidos), a validação da logo SHALL passar.
 *
 * **Validates: Requirements 7.4**
 */

/** Mensagem pt-BR esperada sobre o tamanho máximo da logo (R7.4). */
const LOGO_SIZE_MESSAGE = 'A logomarca deve ter no máximo 2 MB';

/** MIME types aceitos, usados para variar apenas o tamanho na fronteira. */
const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_LOGO_MIME_TYPES);

/** Gera um MIME type de logo aceito (R7.3), isolando a regra de tamanho. */
const allowedMimeArb = fc.constantFrom(...ALLOWED_MIME_TYPES);

/**
 * Gera um corpo de cadastro base válido (sem logo). Varia os campos de texto
 * dentro dos limites aceitos para garantir que a única razão de rejeição
 * observada seja o tamanho da logo.
 */
const validBaseArb = fc.record({
  businessName: fc.string({ minLength: 1, maxLength: 120 }).filter((s) => s.trim().length >= 1),
  contactName: fc.string({ minLength: 1, maxLength: 120 }).filter((s) => s.trim().length >= 1),
  contactPhone: fc.constant('+5511987654321'),
  adminName: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
  adminEmail: fc.constant('admin@example.com'),
  password: fc.string({ minLength: 8, maxLength: 72 }),
  slug: fc.constant('minha-empresa'),
  colorPresetId: fc.constant('preset-1'),
});

/** Tamanho de logo estritamente acima do limite (rejeitado por R7.4). */
const overLimitSizeArb = fc.integer({ min: MAX_LOGO_BYTES + 1, max: MAX_LOGO_BYTES * 4 });

/** Tamanho de logo dentro do limite, incluindo a fronteira exata e o zero. */
const withinLimitSizeArb = fc.integer({ min: 0, max: MAX_LOGO_BYTES });

/**
 * Extrai a mensagem de erro da logo (caminho `logo.size`), se houver, para
 * confirmar que a rejeição vem da regra de tamanho e não de outro campo.
 */
function logoSizeMessages(
  result: ReturnType<typeof signupSchema.safeParse>,
): string[] {
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === 'logo' && issue.path[1] === 'size')
    .map((issue) => issue.message);
}

describe('Feature: landing-onboarding, Property 9: Logo maior que o limite é rejeitada', () => {
  it('rejeita qualquer logo com tamanho acima de MAX_LOGO_BYTES com mensagem pt-BR', () => {
    fc.assert(
      fc.property(validBaseArb, allowedMimeArb, overLimitSizeArb, (base, mimetype, size) => {
        const result = signupSchema.safeParse({ ...base, logo: { mimetype, size } });

        // Logo acima do limite: cadastro rejeitado.
        expect(result.success).toBe(false);

        // A rejeição vem da regra de tamanho da logo, com a mensagem pt-BR de R7.4.
        expect(logoSizeMessages(result)).toContain(LOGO_SIZE_MESSAGE);
      }),
      { numRuns: 200 },
    );
  });

  it('aceita a logo (validação de tamanho) para tamanho <= MAX_LOGO_BYTES', () => {
    fc.assert(
      fc.property(validBaseArb, allowedMimeArb, withinLimitSizeArb, (base, mimetype, size) => {
        const result = signupSchema.safeParse({ ...base, logo: { mimetype, size } });

        // Com todos os campos válidos e tamanho dentro do limite, o parse passa
        // e, portanto, nenhum erro de tamanho de logo é emitido.
        expect(result.success).toBe(true);
        expect(logoSizeMessages(result)).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it('trata a fronteira exata (MAX_LOGO_BYTES vs. MAX_LOGO_BYTES + 1) corretamente', () => {
    const base = {
      businessName: 'Empresa Teste',
      contactName: 'Contato Teste',
      contactPhone: '+5511987654321',
      adminName: 'Admin Teste',
      adminEmail: 'admin@example.com',
      password: 'senha-forte-123',
      slug: 'minha-empresa',
      colorPresetId: 'preset-1',
    };

    const atLimit = signupSchema.safeParse({
      ...base,
      logo: { mimetype: 'image/png', size: MAX_LOGO_BYTES },
    });
    expect(atLimit.success).toBe(true);

    const overLimit = signupSchema.safeParse({
      ...base,
      logo: { mimetype: 'image/png', size: MAX_LOGO_BYTES + 1 },
    });
    expect(overLimit.success).toBe(false);
    expect(logoSizeMessages(overLimit)).toContain(LOGO_SIZE_MESSAGE);
  });
});
