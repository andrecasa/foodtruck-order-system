/**
 * Client-side password validation for the "Esqueceu sua senha?" reset flow.
 *
 * Pure, side-effect-free functions used by the ResetPasswordScreen to decide
 * whether the reset request may be sent to the backend. Submission is blocked
 * when the new password and its confirmation differ, or when the new password
 * length falls outside the 8–72 character range (inclusive) enforced by the
 * system password policy (Supabase limit).
 *
 * Validates: Requirements 5.6, 7.4
 */

/** Minimum allowed password length (inclusive). */
export const MIN_PASSWORD_LENGTH = 8;

/** Maximum allowed password length (inclusive). */
export const MAX_PASSWORD_LENGTH = 72;

/** pt-BR message shown when the password length is out of range. */
export const PASSWORD_LENGTH_MESSAGE = 'A senha deve ter entre 8 e 72 caracteres';

/** pt-BR message shown when the password and its confirmation differ. */
export const PASSWORD_MISMATCH_MESSAGE = 'As senhas não coincidem';

/**
 * Result of validating a (newPassword, confirmation) pair.
 *
 * - `allowed`: whether the reset request may be submitted.
 * - `error`: a pt-BR error message when `allowed` is false, otherwise `null`.
 */
export interface PasswordValidationResult {
  allowed: boolean;
  error: string | null;
}

/**
 * Returns whether the new password length is within the allowed range
 * (8–72 characters inclusive).
 */
export function isPasswordLengthValid(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH;
}

/**
 * Validates a (newPassword, confirmation) pair for the reset flow.
 *
 * Submission is blocked (`allowed: false`) when:
 * - the password length is outside 8–72 characters (inclusive), or
 * - the password and its confirmation are not identical.
 *
 * The length check takes precedence so the user is guided toward a valid
 * password before being told the confirmation does not match.
 */
export function validateNewPassword(
  newPassword: string,
  confirmation: string,
): PasswordValidationResult {
  if (!isPasswordLengthValid(newPassword)) {
    return { allowed: false, error: PASSWORD_LENGTH_MESSAGE };
  }

  if (newPassword !== confirmation) {
    return { allowed: false, error: PASSWORD_MISMATCH_MESSAGE };
  }

  return { allowed: true, error: null };
}

/**
 * Convenience predicate: whether the reset request may be submitted for the
 * given (newPassword, confirmation) pair.
 */
export function canSubmitPasswordReset(newPassword: string, confirmation: string): boolean {
  return validateNewPassword(newPassword, confirmation).allowed;
}
