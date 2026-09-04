import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { resetPasswordSchema } from '../../validation/password-reset.validation.js';

/**
 * Feature: forgot-password, Property 16: Política de comprimento de senha
 *
 * Para qualquer nova senha com comprimento fora do intervalo de 8 a 72 caracteres
 * inclusive (incluindo vazia), o Sistema_Recuperacao deve recusar a redefinição com
 * a mensagem em pt-BR indicando que a senha deve ter entre 8 e 72 caracteres.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */

const LENGTH_MESSAGE = 'A senha deve ter entre 8 e 72 caracteres';

// Fixed valid inputs for the fields we are not testing, so that any validation
// failure is attributable solely to the newPassword length policy.
const VALID_EMAIL = 'usuario@exemplo.com';
const VALID_CODE = '123456';

function parse(newPassword: string) {
  return resetPasswordSchema.safeParse({
    email: VALID_EMAIL,
    code: VALID_CODE,
    newPassword,
  });
}

function newPasswordMessages(result: ReturnType<typeof parse>): string[] {
  if (result.success) return [];
  return result.error.issues
    .filter((issue) => issue.path[0] === 'newPassword')
    .map((issue) => issue.message);
}

// Generator: empty password (Requirement 7.3 - vazia)
const emptyPasswordArb = fc.constant('');

// Generator: passwords with fewer than 8 characters (Requirement 7.1)
const tooShortArb = fc.string({ minLength: 0, maxLength: 7 });

// Generator: passwords with more than 72 characters (Requirement 7.2)
const tooLongArb = fc.string({ minLength: 73, maxLength: 200 });

// Combined generator for all invalid-length passwords
const invalidLengthArb = fc.oneof(emptyPasswordArb, tooShortArb, tooLongArb);

// Generator: passwords within the valid range [8, 72]
const validLengthArb = fc.string({ minLength: 8, maxLength: 72 });

describe('Feature: forgot-password, Property 16: Política de comprimento de senha', () => {
  it('rejects passwords shorter than 8 characters with the pt-BR length message', () => {
    fc.assert(
      fc.property(tooShortArb, (newPassword) => {
        const result = parse(newPassword);
        expect(result.success).toBe(false);
        expect(newPasswordMessages(result)).toContain(LENGTH_MESSAGE);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects empty password with the pt-BR length message', () => {
    fc.assert(
      fc.property(emptyPasswordArb, (newPassword) => {
        const result = parse(newPassword);
        expect(result.success).toBe(false);
        expect(newPasswordMessages(result)).toContain(LENGTH_MESSAGE);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects passwords longer than 72 characters with the pt-BR length message', () => {
    fc.assert(
      fc.property(tooLongArb, (newPassword) => {
        const result = parse(newPassword);
        expect(result.success).toBe(false);
        expect(newPasswordMessages(result)).toContain(LENGTH_MESSAGE);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects any out-of-range password (empty, too short, or too long) with the pt-BR length message', () => {
    fc.assert(
      fc.property(invalidLengthArb, (newPassword) => {
        const result = parse(newPassword);
        expect(result.success).toBe(false);
        expect(newPasswordMessages(result)).toContain(LENGTH_MESSAGE);
      }),
      { numRuns: 100 },
    );
  });

  it('does NOT emit the length message for passwords within 8-72 characters', () => {
    fc.assert(
      fc.property(validLengthArb, (newPassword) => {
        const result = parse(newPassword);
        expect(newPasswordMessages(result)).not.toContain(LENGTH_MESSAGE);
      }),
      { numRuns: 100 },
    );
  });
});
