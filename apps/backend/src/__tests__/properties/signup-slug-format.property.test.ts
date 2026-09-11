import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { signupSchema, SLUG_FORMAT } from '../../validation/signup.validation.js';
import { RESERVED_SLUGS, isReservedSlug } from '../../validation/signup-slug.util.js';

/**
 * Feature: landing-onboarding, Property 4: Validação de formato do slug
 *
 * Para qualquer string candidata a slug, o `signupSchema` considera o slug de
 * formato VÁLIDO se e somente se ele casar `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`.
 * Slugs de formato inválido (vazio, <3 ou >60 caracteres, caracteres fora de
 * `[a-z0-9-]`, hífen no início/fim) são rejeitados com mensagem em pt-BR, e
 * slugs pertencentes a `RESERVED_SLUGS` são tratados como indisponíveis (via
 * `isReservedSlug`).
 *
 * **Validates: Requirements 4.3, 4.4, 4.5, 5.3**
 */

// Base de cadastro válida (exceto o slug, que é injetado por cada propriedade).
// Mantida local para não depender da tarefa 6.3.
const VALID_BASE = {
  businessName: 'Empresa Teste',
  contactName: 'Responsável Teste',
  contactPhone: '+55 (11) 99999-1234',
  adminName: 'Admin Teste',
  adminEmail: 'admin@example.com',
  password: 'senha1234',
  colorPresetId: 'classico',
} as const;

/** Valida apenas o campo `slug` através do `signupSchema` completo. */
function parseSlug(slug: string) {
  return signupSchema.safeParse({ ...VALID_BASE, slug });
}

/** Extrai a mensagem de erro pt-BR referente ao campo `slug`, se houver. */
function slugErrorMessage(result: ReturnType<typeof parseSlug>): string | undefined {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === 'slug')?.message;
}

/** Slugs reservados como array (fast-check exige spread de array). */
const RESERVED_SLUGS_ARRAY = [...RESERVED_SLUGS];

const LOWER_ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const lowerAlnumArb = fc.constantFrom(...LOWER_ALNUM);
const slugInnerCharArb = fc.constantFrom(...LOWER_ALNUM, '-');

// Gerador de slugs bem-formados: primeiro e último char em [a-z0-9], miolo em
// [a-z0-9-], comprimento total de 3 a 60. Casa exatamente o SLUG_FORMAT.
const wellFormedSlugArb = fc
  .tuple(
    lowerAlnumArb,
    fc.array(slugInnerCharArb, { minLength: 1, maxLength: 58 }),
    lowerAlnumArb,
  )
  .map(([first, middle, last]) => `${first}${middle.join('')}${last}`)
  .filter((slug) => SLUG_FORMAT.test(slug));

// Geradores de slugs malformados (cada um viola o SLUG_FORMAT):
const emptySlugArb = fc.constant('');

// Comprimento 1 ou 2 (menor que o mínimo de 3).
const tooShortArb = fc
  .array(lowerAlnumArb, { minLength: 1, maxLength: 2 })
  .map((chars) => chars.join(''));

// Comprimento > 60 (maior que o máximo).
const tooLongArb = fc
  .array(lowerAlnumArb, { minLength: 61, maxLength: 90 })
  .map((chars) => chars.join(''));

// Contém pelo menos um caractere fora de [a-z0-9-] (ex.: maiúsculas, espaço,
// acento, símbolos), garantindo comprimento válido em outros aspectos.
const invalidCharArb = fc
  .array(
    fc.constantFrom(...LOWER_ALNUM, 'A', 'Z', ' ', '_', 'ç', 'ã', '.', '/', '@', 'É'),
    { minLength: 3, maxLength: 60 },
  )
  .map((chars) => chars.join(''))
  .filter((slug) => !SLUG_FORMAT.test(slug) && slug.length >= 3 && slug.length <= 60);

// Hífen no início e/ou no fim (formato inválido apesar do comprimento válido).
const edgeHyphenArb = fc
  .array(slugInnerCharArb, { minLength: 1, maxLength: 58 })
  .map((chars) => chars.join(''))
  .chain((core) =>
    fc.constantFrom(`-${core}`, `${core}-`, `-${core}-`),
  )
  .filter((slug) => slug.length >= 3 && slug.length <= 60);

// Qualquer string arbitrária: a validação do schema deve concordar com o regex.
const anyStringArb = fc.string({ maxLength: 70 });

describe('Feature: landing-onboarding, Property 4: Validação de formato do slug', () => {
  it('aceita qualquer slug que casa o SLUG_FORMAT (formato válido)', () => {
    fc.assert(
      fc.property(wellFormedSlugArb, (slug) => {
        const result = parseSlug(slug);

        expect(result.success).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('rejeita, com mensagem pt-BR, slugs vazios ou fora do comprimento (R4.4)', () => {
    fc.assert(
      fc.property(fc.oneof(emptySlugArb, tooShortArb, tooLongArb), (slug) => {
        const result = parseSlug(slug);
        const message = slugErrorMessage(result);

        expect(result.success).toBe(false);
        expect(message).toBeDefined();
        expect(message).toContain('Slug inválido');
      }),
      { numRuns: 200 },
    );
  });

  it('rejeita, com mensagem pt-BR, slugs com caracteres fora de [a-z0-9-] (R4.4)', () => {
    fc.assert(
      fc.property(invalidCharArb, (slug) => {
        const result = parseSlug(slug);
        const message = slugErrorMessage(result);

        expect(result.success).toBe(false);
        expect(message).toContain('Slug inválido');
      }),
      { numRuns: 200 },
    );
  });

  it('rejeita, com mensagem pt-BR, slugs com hífen no início/fim (R4.4)', () => {
    fc.assert(
      fc.property(edgeHyphenArb, (slug) => {
        const result = parseSlug(slug);
        const message = slugErrorMessage(result);

        expect(result.success).toBe(false);
        expect(message).toContain('Slug inválido');
      }),
      { numRuns: 200 },
    );
  });

  it('a validação do schema concorda com o SLUG_FORMAT para qualquer string (iff, R4.3)', () => {
    fc.assert(
      fc.property(anyStringArb, (slug) => {
        const matchesRegex = SLUG_FORMAT.test(slug);
        const result = parseSlug(slug);

        // Formato válido pelo schema se e somente se casa o regex.
        expect(result.success).toBe(matchesRegex);
      }),
      { numRuns: 300 },
    );
  });

  it('todo slug reservado é tratado como indisponível e tem formato válido (R4.5/R5.3)', () => {
    fc.assert(
      fc.property(fc.constantFrom(...RESERVED_SLUGS_ARRAY), (slug) => {
        // Reservados têm formato válido (só a reserva os torna indisponíveis).
        expect(SLUG_FORMAT.test(slug)).toBe(true);
        expect(parseSlug(slug).success).toBe(true);

        // Mas são considerados indisponíveis pela util compartilhada.
        expect(isReservedSlug(slug)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('slugs bem-formados não reservados não são tratados como indisponíveis por reserva', () => {
    fc.assert(
      fc.property(
        wellFormedSlugArb.filter((slug) => !RESERVED_SLUGS.has(slug)),
        (slug) => {
          expect(isReservedSlug(slug)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});
