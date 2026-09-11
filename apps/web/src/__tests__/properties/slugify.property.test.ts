import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { slugify } from '../../utils/slugify';

/**
 * Feature: landing-onboarding, Property 3: `slugify` sempre produz um slug
 * bem-formado ou vazio.
 *
 * Para qualquer string de nome de empresa, o resultado de `slugify` SHALL ser
 * uma string que ou é vazia ou casa o padrão `^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$`:
 * sem acentos, sem letras maiúsculas, sem caracteres fora de `[a-z0-9-]`, sem
 * hífens consecutivos e sem hífen no início ou fim (comprimento 3–60). O backend
 * permanece a autoridade final de validação.
 *
 * **Validates: Requirements 4.1**
 */

/** Padrão exigido pelo backend para um slug bem-formado (R4.1/R4.3). */
const WELL_FORMED_SLUG = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

/**
 * Verdadeiro quando o resultado do `slugify` está em uma forma aceitável:
 * string vazia OU um slug bem-formado.
 */
function isEmptyOrWellFormed(slug: string): boolean {
  return slug === '' || WELL_FORMED_SLUG.test(slug);
}

describe('Property 3: slugify sempre produz slug bem-formado ou vazio', () => {
  describe('exemplos concretos', () => {
    it('normaliza acentos e maiúsculas', () => {
      expect(slugify('Pastel das Meninas')).toBe('pastel-das-meninas');
    });

    it('remove diacríticos preservando os caracteres base', () => {
      expect(slugify('Café São João')).toBe('cafe-sao-joao');
    });

    it('colapsa símbolos e espaços em um único hífen', () => {
      expect(slugify('A & B   ---  C')).toBe('a-b-c');
    });

    it('apara hífens das extremidades', () => {
      expect(slugify('  --Hello--  ')).toBe('hello');
    });

    it('retorna vazio quando a normalização não atinge o mínimo de 3 chars', () => {
      expect(slugify('!!')).toBe('');
      expect(slugify('ab')).toBe('');
      expect(slugify('   ')).toBe('');
      expect(slugify('')).toBe('');
    });

    it('trunca em 60 chars sem deixar hífen à direita', () => {
      const result = slugify('a'.repeat(200));
      expect(result.length).toBeLessThanOrEqual(60);
      expect(result.endsWith('-')).toBe(false);
      expect(isEmptyOrWellFormed(result)).toBe(true);
    });
  });

  describe('propriedade universal', () => {
    it('para qualquer string, o resultado é vazio ou casa o padrão do slug', () => {
      fc.assert(
        fc.property(fc.string(), (input) => {
          return isEmptyOrWellFormed(slugify(input));
        }),
        { numRuns: 500 },
      );
    });

    it('mantém-se bem-formado com unicode, acentos e símbolos arbitrários', () => {
      fc.assert(
        fc.property(fc.string({ unit: 'binary' }), (input) => {
          return isEmptyOrWellFormed(slugify(input));
        }),
        { numRuns: 500 },
      );
    });

    it('mantém-se bem-formado para strings muito longas', () => {
      const longStringArb = fc.string({
        unit: 'binary',
        minLength: 100,
        maxLength: 1000,
      });

      fc.assert(
        fc.property(longStringArb, (input) => {
          const slug = slugify(input);
          return isEmptyOrWellFormed(slug) && slug.length <= 60;
        }),
        { numRuns: 200 },
      );
    });

    it('nunca contém hífens consecutivos nem hífen nas extremidades', () => {
      fc.assert(
        fc.property(fc.string({ unit: 'binary' }), (input) => {
          const slug = slugify(input);
          if (slug === '') return true;
          return (
            !slug.includes('--') &&
            !slug.startsWith('-') &&
            !slug.endsWith('-')
          );
        }),
        { numRuns: 500 },
      );
    });

    it('nunca contém letras maiúsculas nem caracteres fora de [a-z0-9-]', () => {
      fc.assert(
        fc.property(fc.string({ unit: 'binary' }), (input) => {
          const slug = slugify(input);
          return /^[a-z0-9-]*$/.test(slug);
        }),
        { numRuns: 500 },
      );
    });
  });
});
