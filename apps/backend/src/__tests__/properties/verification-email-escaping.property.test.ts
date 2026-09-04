import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import {
  applyPlaceholders,
  escapeHtml,
} from '../../services/email/templates/verification-email.js';

/**
 * Feature: email-delivery, Property 8: Substituição de placeholders escapa valores
 *
 * Para qualquer valor substituído que contenha caracteres especiais de HTML
 * (`&`, `<`, `>`, `"`, `'`), o HTML renderizado por `applyPlaceholders` não deve
 * conter esses caracteres na forma bruta oriunda do valor, mas sim suas entidades
 * escapadas — de modo que valores substituídos nunca introduzam marcação HTML.
 *
 * **Validates: Requirements 6.6**
 */

// Caracteres especiais de HTML e suas entidades escapadas correspondentes.
const HTML_ESCAPES: ReadonlyArray<{ raw: string; entity: string }> = [
  { raw: '&', entity: '&amp;' },
  { raw: '<', entity: '&lt;' },
  { raw: '>', entity: '&gt;' },
  { raw: '"', entity: '&quot;' },
  { raw: "'", entity: '&#39;' },
];

const SPECIAL_CHARS = HTML_ESCAPES.map((e) => e.raw);

// Generator: valores que contêm pelo menos um caractere especial de HTML,
// misturado com texto arbitrário. Garante que o espaço de entrada exercite
// os caracteres perigosos que precisam ser escapados.
const valueWithSpecialCharsArb = fc
  .array(
    fc.oneof(
      fc.constantFrom(...SPECIAL_CHARS),
      // caracteres "normais" (sem chars especiais) para simular texto real ao redor
      fc.string({ minLength: 0, maxLength: 4 }).filter((s) => !/[&<>"']/.test(s)),
    ),
    { minLength: 1, maxLength: 12 },
  )
  .map((parts) => parts.join(''))
  .filter((s) => /[&<>"']/.test(s));

/**
 * Extrai apenas a fatia do HTML renderizado que corresponde ao valor
 * substituído, isolando-a das partes brutas do template. O template de teste
 * envolve o placeholder com marcadores únicos que não contêm caracteres
 * especiais, então tudo entre os marcadores é exatamente o valor renderizado.
 */
const START_MARKER = 'STARTvalueZONE';
const END_MARKER = 'ENDvalueZONE';
const TEST_TEMPLATE = `<p data-x="fixed">${START_MARKER}{{value}}${END_MARKER}</p>`;

function extractRenderedValue(rendered: string): string {
  const start = rendered.indexOf(START_MARKER) + START_MARKER.length;
  const end = rendered.indexOf(END_MARKER);
  return rendered.slice(start, end);
}

describe('Feature: email-delivery, Property 8: Substituição de placeholders escapa valores', () => {
  it('escapa caracteres especiais de HTML oriundos do valor substituído', () => {
    fc.assert(
      fc.property(valueWithSpecialCharsArb, (value) => {
        const rendered = applyPlaceholders(TEST_TEMPLATE, { value });

        // Isola a porção do HTML que veio do valor (não do template).
        const renderedValue = extractRenderedValue(rendered);

        // A fatia renderizada do valor deve ser exatamente o valor escapado.
        expect(renderedValue).toBe(escapeHtml(value));

        // Nenhum caractere de marcação bruto (`<`, `>`, `"`, `'`) oriundo do
        // valor pode sobreviver na fatia renderizada — todos viram entidades.
        // (`&` é omitido aqui porque as próprias entidades escapadas contêm um
        // `&` legítimo, ex.: `&lt;`; a igualdade exata acima já garante que
        // qualquer `&` bruto do valor foi convertido em `&amp;`.)
        for (const raw of ['<', '>', '"', "'"]) {
          expect(renderedValue.includes(raw)).toBe(false);
        }

        // Cada caractere especial presente no valor original deve aparecer
        // como sua entidade escapada na fatia renderizada.
        for (const { raw, entity } of HTML_ESCAPES) {
          if (value.includes(raw)) {
            expect(renderedValue.includes(entity)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
