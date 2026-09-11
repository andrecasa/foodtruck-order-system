import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  signupSchema,
  MAX_BUSINESS_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from '../../validation/signup.validation.js';

/**
 * Feature: landing-onboarding, Property 1: Validação de campos de cadastro
 * rejeita entradas inválidas.
 *
 * Para qualquer combinação de campos em que `businessName` seja vazio (após
 * `trim`) ou exceda 120 caracteres, `contactName` seja vazio, `contactPhone`
 * não corresponda ao formato de telefone aceito, `adminEmail` tenha formato
 * inválido, ou `password` tenha menos que o comprimento mínimo (8), o
 * `signupSchema` SHALL rejeitar a entrada (`safeParse.success === false`) com
 * mensagem em pt-BR, de modo que nenhum efeito colateral (upload ou
 * `provisionTenant`) chegue a ser produzido.
 *
 * **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 9.2, 9.3**
 */

// --- Valores válidos de base (isolam o campo sob teste) ----------------------
// Cada cenário parte de um cadastro totalmente válido e injeta um valor inválido
// apenas no campo alvo, garantindo que a rejeição decorra exclusivamente dele.
const VALID_BASE = {
  businessName: 'Empresa Teste',
  contactName: 'Responsável Teste',
  contactPhone: '+5511999998888',
  adminName: 'Admin Teste',
  adminEmail: 'admin@example.com',
  password: 'senhaSegura123',
  slug: 'empresa-teste',
  colorPresetId: 'classico',
} as const;

// Detecta se ao menos uma mensagem de erro está em pt-BR (contém caractere
// acentuado ou termos do domínio em português das mensagens do schema).
const PT_BR_PATTERN = /[áàâãéêíóôõúç]|senha|empresa|respons|telefone|e-mail|inválid/i;

function expectRejectedWithPtBr(input: Record<string, unknown>): boolean {
  const result = signupSchema.safeParse(input);
  if (result.success) return false;
  const messages = result.error.issues.map((issue) => issue.message);
  // Ao menos uma mensagem de erro deve estar em pt-BR.
  return messages.some((message) => PT_BR_PATTERN.test(message));
}

// --- Generators por campo inválido -------------------------------------------

/** businessName vazio após trim: só espaços em branco (inclui vazio). */
const emptyBusinessNameArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 10 })
  .map((chars) => chars.join(''));

/** businessName maior que o limite (após trim continua > 120). */
const tooLongBusinessNameArb = fc
  .integer({ min: MAX_BUSINESS_NAME_LENGTH + 1, max: MAX_BUSINESS_NAME_LENGTH + 100 })
  .map((len) => 'a'.repeat(len));

/** contactName vazio após trim. */
const emptyContactNameArb = fc
  .array(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 8 })
  .map((chars) => chars.join(''));

/**
 * contactPhone inválido: após `normalizePhone` (remove espaços, `()`, `-`) o
 * valor não bate `^\+?[1-9]\d{9,14}$`. Cobre vazio, com letras, curto demais,
 * longo demais e começando com zero.
 */
const invalidPhoneArb = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  // Contém letras/símbolos não removidos pela normalização.
  fc.string({ minLength: 1, maxLength: 12 }).filter((s) => /[a-zA-Z]/.test(s)),
  // Poucos dígitos (após remover máscara, < 10 dígitos).
  fc.integer({ min: 0, max: 999_999 }).map((n) => `+${n}`),
  // Dígitos demais (> 15).
  fc.constant('+1234567890123456'),
  // Começa com zero (viola `[1-9]` inicial).
  fc.constant('0123456789'),
);

/** adminEmail com formato inválido (sem `@` ou vazio). */
const invalidEmailArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1, maxLength: 40 }).filter((s) => !s.includes('@')),
);

/** password mais curta que o mínimo (0..MIN_PASSWORD_LENGTH-1 caracteres). */
const tooShortPasswordArb = fc
  .integer({ min: 0, max: MIN_PASSWORD_LENGTH - 1 })
  .map((len) => 'x'.repeat(len));

// --- Propriedades ------------------------------------------------------------

describe('Feature: landing-onboarding, Property 1: Validação de campos de cadastro rejeita entradas inválidas', () => {
  it('rejeita businessName vazio (após trim) com mensagem pt-BR', () => {
    fc.assert(
      fc.property(emptyBusinessNameArb, (businessName) => {
        expect(expectRejectedWithPtBr({ ...VALID_BASE, businessName })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita businessName com mais de 120 caracteres com mensagem pt-BR', () => {
    fc.assert(
      fc.property(tooLongBusinessNameArb, (businessName) => {
        expect(expectRejectedWithPtBr({ ...VALID_BASE, businessName })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita contactName vazio (após trim) com mensagem pt-BR', () => {
    fc.assert(
      fc.property(emptyContactNameArb, (contactName) => {
        expect(expectRejectedWithPtBr({ ...VALID_BASE, contactName })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita contactPhone em formato inválido com mensagem pt-BR', () => {
    fc.assert(
      fc.property(invalidPhoneArb, (contactPhone) => {
        expect(expectRejectedWithPtBr({ ...VALID_BASE, contactPhone })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita adminEmail em formato inválido com mensagem pt-BR', () => {
    fc.assert(
      fc.property(invalidEmailArb, (adminEmail) => {
        expect(expectRejectedWithPtBr({ ...VALID_BASE, adminEmail })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita password mais curta que o mínimo (8) com mensagem pt-BR', () => {
    fc.assert(
      fc.property(tooShortPasswordArb, (password) => {
        expect(expectRejectedWithPtBr({ ...VALID_BASE, password })).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
