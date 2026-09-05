/**
 * Client-side e-mail validation for the "Esqueceu sua senha?" reset flow.
 *
 * Pure, side-effect-free functions used by the RequestCodeScreen to give the
 * user immediate UX feedback before a request reaches the backend. The checks
 * are intentionally light and permissive — the backend (Zod `.max(254).email()`)
 * remains the authoritative validator, so we only aim to catch obvious mistakes
 * and match the backend's pt-BR message when the format is clearly invalid.
 *
 * Validates: Requirements 2.1
 */

/** Maximum allowed e-mail length (RFC 5321 max), aligned with the backend. */
export const MAX_EMAIL_LENGTH = 254;

/** pt-BR message shown when the e-mail format is invalid (matches backend). */
export const EMAIL_INVALID_MESSAGE = 'Formato de e-mail inválido';

/**
 * Result of validating an e-mail address.
 *
 * - `valid`: whether the e-mail passes the light client-side format check.
 * - `error`: a pt-BR error message when the (non-empty) e-mail is malformed,
 *   otherwise `null`. An empty/whitespace-only e-mail returns `valid: false`
 *   with `error: null` so the caller can decide the "obrigatório" message.
 */
export interface EmailValidationResult {
  valid: boolean;
  error: string | null;
}

/**
 * Light, pragmatic e-mail format check (NOT a full RFC validator).
 *
 * Requires exactly one `@`, a non-empty local part before it, and a domain
 * after it containing at least one dot with non-empty labels. Kept simple and
 * permissive on purpose; the backend is authoritative.
 */
export function isEmailFormatValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates an e-mail address for the reset flow.
 *
 * The e-mail is trimmed first. An empty result returns `valid: false` with
 * `error: null` so the screen can show its own "obrigatório" message. A
 * non-empty e-mail is invalid (`error: EMAIL_INVALID_MESSAGE`) when it exceeds
 * `MAX_EMAIL_LENGTH` or fails the light format check.
 */
export function validateEmail(email: string): EmailValidationResult {
  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: null };
  }

  if (trimmed.length > MAX_EMAIL_LENGTH || !isEmailFormatValid(trimmed)) {
    return { valid: false, error: EMAIL_INVALID_MESSAGE };
  }

  return { valid: true, error: null };
}

/**
 * Convenience predicate: whether the given e-mail passes client-side validation.
 */
export function canSubmitEmail(email: string): boolean {
  return validateEmail(email).valid;
}
