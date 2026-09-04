import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { forgotPasswordSchema } from '../../validation/password-reset.validation.js';

/**
 * Feature: forgot-password, Property 2: E-mails inválidos são rejeitados sem gerar código
 *
 * Para qualquer string de e-mail em formato inválido (vazia, sem `@`, ou com mais
 * de 254 caracteres), o `forgotPasswordSchema` SHALL rejeitar a entrada com uma
 * mensagem de erro em pt-BR indicando que o formato do e-mail é inválido, de modo
 * que nenhum Codigo_Verificacao chegue a ser gerado.
 *
 * **Validates: Requirements 2.3**
 */

const PT_BR_EMAIL_ERROR = 'Formato de e-mail inválido';

// Generator: empty string
const emptyStringArb = fc.constant('');

// Generator: strings without an '@' character (invalid email format)
const noAtSignArb = fc
  .string({ minLength: 1, maxLength: 60 })
  .filter((s) => !s.includes('@'));

// Generator: strings longer than 254 characters (exceeds max length).
// Built as a syntactically valid-looking email so that only the length rule
// can be the reason for rejection.
const tooLongArb = fc
  .integer({ min: 255, max: 400 })
  .map((len) => {
    const domain = '@example.com';
    const localLen = Math.max(1, len - domain.length);
    return 'a'.repeat(localLen) + domain;
  })
  .filter((s) => s.length > 254);

// Combined generator for all invalid emails targeted by this property
const invalidEmailArb = fc.oneof(emptyStringArb, noAtSignArb, tooLongArb);

function expectRejectedWithPtBrMessage(email: string): void {
  const result = forgotPasswordSchema.safeParse({ email });

  // Invalid email must be rejected (no code would ever be generated)
  expect(result.success).toBe(false);

  if (!result.success) {
    const messages = result.error.issues.map((issue) => issue.message);
    // At least one error must be the pt-BR email format message
    expect(messages).toContain(PT_BR_EMAIL_ERROR);
  }
}

describe('Feature: forgot-password, Property 2: E-mails inválidos são rejeitados sem gerar código', () => {
  it('rejeita e-mail vazio com mensagem pt-BR', () => {
    fc.assert(
      fc.property(emptyStringArb, (email) => {
        expectRejectedWithPtBrMessage(email);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita e-mail sem "@" com mensagem pt-BR', () => {
    fc.assert(
      fc.property(noAtSignArb, (email) => {
        expectRejectedWithPtBrMessage(email);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita e-mail com mais de 254 caracteres com mensagem pt-BR', () => {
    fc.assert(
      fc.property(tooLongArb, (email) => {
        expectRejectedWithPtBrMessage(email);
      }),
      { numRuns: 100 },
    );
  });

  it('rejeita qualquer e-mail inválido (vazio, sem "@" ou > 254 chars)', () => {
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        expectRejectedWithPtBrMessage(email);
      }),
      { numRuns: 100 },
    );
  });
});
