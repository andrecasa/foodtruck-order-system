import * as fc from 'fast-check';
import {
  validateNewPassword,
  canSubmitPasswordReset,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_LENGTH_MESSAGE,
  PASSWORD_MISMATCH_MESSAGE,
} from '../password-reset-validation';

/**
 * Feature: forgot-password, Property 17: Validação client-side de senha
 *
 * Para qualquer par (nova senha, confirmação) em que as senhas difiram, ou em
 * que o comprimento esteja fora de 8–72 caracteres, o App_Mobile deve bloquear
 * o envio da solicitação de redefinição. Reciprocamente, quando o comprimento
 * está dentro de 8–72 e a confirmação é idêntica, o envio é permitido.
 *
 * **Validates: Requirements 5.6, 7.4**
 */
describe('Property 17: Validação client-side de senha', () => {
  it('blocks submission when the password length is outside 8–72 characters', () => {
    // Passwords whose length is below the minimum or above the maximum must
    // block submission, regardless of the confirmation value.
    const outOfRangePassword = fc.oneof(
      // Too short: 0..MIN-1 characters (includes the empty string).
      fc
        .integer({ min: 0, max: MIN_PASSWORD_LENGTH - 1 })
        .chain((len) => fc.string({ minLength: len, maxLength: len })),
      // Too long: MAX+1..MAX+40 characters.
      fc
        .integer({ min: MAX_PASSWORD_LENGTH + 1, max: MAX_PASSWORD_LENGTH + 40 })
        .chain((len) => fc.string({ minLength: len, maxLength: len })),
    );

    fc.assert(
      fc.property(outOfRangePassword, fc.string(), (password, confirmation) => {
        const result = validateNewPassword(password, confirmation);

        expect(result.allowed).toBe(false);
        // Length check takes precedence over the mismatch check.
        expect(result.error).toBe(PASSWORD_LENGTH_MESSAGE);
        expect(canSubmitPasswordReset(password, confirmation)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('blocks submission when a valid-length password does not match its confirmation', () => {
    // Generate a valid-length password and a confirmation that differs from it.
    const validLengthPassword = fc
      .integer({ min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH })
      .chain((len) => fc.string({ minLength: len, maxLength: len }));

    fc.assert(
      fc.property(validLengthPassword, fc.string(), (password, otherConfirmation) => {
        // Force a genuine mismatch: append a character so it can never equal password.
        const confirmation = otherConfirmation === password ? `${password}x` : otherConfirmation;
        fc.pre(confirmation !== password);

        const result = validateNewPassword(password, confirmation);

        expect(result.allowed).toBe(false);
        expect(result.error).toBe(PASSWORD_MISMATCH_MESSAGE);
        expect(canSubmitPasswordReset(password, confirmation)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('allows submission when the length is within 8–72 and the confirmation matches', () => {
    const validLengthPassword = fc
      .integer({ min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH })
      .chain((len) => fc.string({ minLength: len, maxLength: len }));

    fc.assert(
      fc.property(validLengthPassword, (password) => {
        // Confirmation is identical to the password.
        const result = validateNewPassword(password, password);

        expect(result.allowed).toBe(true);
        expect(result.error).toBeNull();
        expect(canSubmitPasswordReset(password, password)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('blocks submission for the boundary just outside the range and allows the boundary just inside', () => {
    // Boundary check to complement the random generators: 7 and 73 are blocked,
    // 8 and 72 are allowed (with a matching confirmation).
    const tooShort = 'a'.repeat(MIN_PASSWORD_LENGTH - 1);
    const minValid = 'a'.repeat(MIN_PASSWORD_LENGTH);
    const maxValid = 'a'.repeat(MAX_PASSWORD_LENGTH);
    const tooLong = 'a'.repeat(MAX_PASSWORD_LENGTH + 1);

    expect(canSubmitPasswordReset(tooShort, tooShort)).toBe(false);
    expect(canSubmitPasswordReset(tooLong, tooLong)).toBe(false);
    expect(canSubmitPasswordReset(minValid, minValid)).toBe(true);
    expect(canSubmitPasswordReset(maxValid, maxValid)).toBe(true);
  });
});
