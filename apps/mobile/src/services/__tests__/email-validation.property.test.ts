import * as fc from 'fast-check';
import {
  validateEmail,
  canSubmitEmail,
  MAX_EMAIL_LENGTH,
  EMAIL_INVALID_MESSAGE,
} from '../email-validation';

/**
 * Feature: forgot-password — Validação client-side de e-mail
 *
 * O App_Mobile aplica uma verificação leve de formato de e-mail antes de enviar
 * a solicitação ao backend. E-mails sem '@', ou mais longos que 254 caracteres,
 * são bloqueados com a mensagem "Formato de e-mail inválido". E-mails bem
 * formados (com comprimento <= 254) são permitidos. Uma string vazia é tratada
 * como responsabilidade da tela (mensagem "obrigatório"), portanto o util
 * retorna `valid: false` com `error: null`. O backend continua sendo a
 * autoridade final sobre a validação.
 *
 * **Validates: Requirements 2.1**
 */
describe('Validação client-side de e-mail', () => {
  it('blocks non-empty strings without an "@" with the invalid-format message', () => {
    // Non-empty strings that contain neither '@' nor whitespace can never be a
    // valid e-mail, so they must be blocked with EMAIL_INVALID_MESSAGE.
    const noAtString = fc.string({ minLength: 1 }).filter((s) => {
      const trimmed = s.trim();
      return trimmed.length > 0 && !trimmed.includes('@');
    });

    fc.assert(
      fc.property(noAtString, (email) => {
        const result = validateEmail(email);

        expect(result.valid).toBe(false);
        expect(result.error).toBe(EMAIL_INVALID_MESSAGE);
        expect(canSubmitEmail(email)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('blocks e-mails longer than 254 characters with the invalid-format message', () => {
    // Build an otherwise well-formed e-mail whose total length exceeds the max.
    const tooLongEmail = fc
      .integer({ min: MAX_EMAIL_LENGTH, max: MAX_EMAIL_LENGTH + 40 })
      .map((localLen) => `${'a'.repeat(localLen)}@example.com`);

    fc.assert(
      fc.property(tooLongEmail, (email) => {
        expect(email.length).toBeGreaterThan(MAX_EMAIL_LENGTH);

        const result = validateEmail(email);

        expect(result.valid).toBe(false);
        expect(result.error).toBe(EMAIL_INVALID_MESSAGE);
        expect(canSubmitEmail(email)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('allows well-formed e-mails with length <= 254', () => {
    // Generate local and domain labels made of safe characters, plus a TLD, and
    // keep the assembled address within the 254-character limit.
    const label = fc.stringMatching(/^[a-z0-9]{1,20}$/);
    const tld = fc.constantFrom('com', 'net', 'org', 'br', 'io');

    const wellFormedEmail = fc
      .tuple(label, label, tld)
      .map(([local, domain, ext]) => `${local}@${domain}.${ext}`)
      .filter((email) => email.length <= MAX_EMAIL_LENGTH);

    fc.assert(
      fc.property(wellFormedEmail, (email) => {
        const result = validateEmail(email);

        expect(result.valid).toBe(true);
        expect(result.error).toBeNull();
        expect(canSubmitEmail(email)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('treats empty/whitespace input as invalid with a null error (the "obrigatório" case is the screen\'s responsibility)', () => {
    // Empty and whitespace-only strings return valid:false with error null so
    // the screen can decide the "E-mail é obrigatório" message.
    const blankString = fc.stringMatching(/^\s*$/);

    fc.assert(
      fc.property(blankString, (email) => {
        const result = validateEmail(email);

        expect(result.valid).toBe(false);
        expect(result.error).toBeNull();
        expect(canSubmitEmail(email)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
