import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { renderVerificationEmail } from '../../services/email/templates/verification-email.js';
import { buildVerificationBody } from '../../services/email/email.service.js';

/**
 * Feature: email-delivery, Property 7: Fallback em texto sempre presente
 *
 * Para qualquer Codigo_Verificacao válido, `renderVerificationEmail(code).text`
 * deve ser uma string não vazia igual a `buildVerificationBody(code)`, garantindo
 * que a versão em texto puro esteja sempre disponível como fallback,
 * independentemente do HTML.
 *
 * **Validates: Requirements 4.4**
 */

// Generator: códigos de verificação válidos — sequências de 6 dígitos numéricos.
const verificationCodeArb = fc
  .integer({ min: 0, max: 999999 })
  .map((n) => n.toString().padStart(6, '0'));

describe('Feature: email-delivery, Property 7: Fallback em texto sempre presente', () => {
  it('text é não vazio e igual a buildVerificationBody(code) para qualquer código de 6 dígitos', () => {
    fc.assert(
      fc.property(verificationCodeArb, (code) => {
        const { text } = renderVerificationEmail(code);

        // Fallback em texto puro SEMPRE presente (não vazio).
        expect(text.length).toBeGreaterThan(0);

        // E estritamente igual ao corpo em texto produzido por buildVerificationBody.
        expect(text).toBe(buildVerificationBody(code));
      }),
      { numRuns: 100 },
    );
  });
});
