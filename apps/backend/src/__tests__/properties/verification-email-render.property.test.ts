import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { renderVerificationEmail } from '../../services/email/templates/verification-email.js';

/**
 * Feature: email-delivery, Property 6: E-mail renderizado contém o código e a
 * expiração em texto e HTML.
 *
 * Para qualquer Codigo_Verificacao de 6 dígitos, o resultado de
 * `renderVerificationEmail(code)` deve produzir um `text` e um `html` que ambos
 * contêm o código e a indicação de expiração em 15 minutos (o número `15`).
 *
 * **Validates: Requirements 4.4, 4.5**
 */
describe('Feature: email-delivery, Property 6: código e expiração em texto e HTML', () => {
  // Generator: código de verificação de exatamente 6 dígitos numéricos.
  const sixDigitCode = fc
    .integer({ min: 0, max: 999999 })
    .map((n) => n.toString().padStart(6, '0'));

  it('text e html contêm o código e o número 15', () => {
    fc.assert(
      fc.property(sixDigitCode, (code) => {
        const { text, html } = renderVerificationEmail(code);

        // O corpo em texto contém o código e a expiração (15).
        expect(text).toContain(code);
        expect(text).toContain('15');

        // O corpo HTML contém o código e a expiração (15).
        expect(html).toContain(code);
        expect(html).toContain('15');
      }),
      { numRuns: 100 },
    );
  });
});
