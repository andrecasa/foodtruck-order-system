import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: email-delivery, Property 5: Falha do transport propaga
 *
 * Para qualquer erro lançado/rejeitado por `transport.sendMail`, a chamada
 * `send` do `Provedor_SMTP` deve rejeitar (propagar o erro), e não resolver
 * silenciosamente.
 *
 * **Validates: Requirements 3.3**
 */

// Mock do nodemailer: `createTransport` devolve um transport cujo `sendMail`
// é um spy controlado por teste (rejeita com o erro arbitrário gerado). Assim
// nenhuma conexão SMTP real é aberta.
const sendMailMock = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

import { SmtpEmailProvider } from '../../services/email/smtp-email.provider.js';
import type { EmailMessage } from '../../services/email/email.service.js';
import type { SmtpConfig } from '../../services/email/smtp-config.js';

/** Configuração SMTP mínima e válida — os valores não afetam esta propriedade. */
const CONFIG: SmtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'user@example.com',
  pass: 'segredo-nunca-logado',
  from: 'no-reply@example.com',
  secure: false,
};

/** Gera uma `EmailMessage` arbitrária, com ou sem `html`. */
const messageArb: fc.Arbitrary<EmailMessage> = fc.record(
  {
    to: fc.string({ minLength: 1, maxLength: 40 }),
    subject: fc.string({ maxLength: 40 }),
    body: fc.string({ maxLength: 80 }),
    html: fc.option(fc.string({ maxLength: 80 }), { nil: undefined }),
  },
  { requiredKeys: ['to', 'subject', 'body'] },
);

/**
 * Gera um "erro" arbitrário para a rejeição de `sendMail`. Cobre tanto os
 * objetos `Error` (com campos de diagnóstico do nodemailer) quanto valores de
 * rejeição não convencionais (string, número), garantindo que a propagação
 * ocorra independentemente do formato do erro.
 */
const rejectionArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.record(
    {
      message: fc.string({ maxLength: 60 }),
      code: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
      responseCode: fc.option(fc.integer({ min: 400, max: 599 }), { nil: undefined }),
      response: fc.option(fc.string({ maxLength: 60 }), { nil: undefined }),
    },
    { requiredKeys: ['message'] },
  ).map((fields) => Object.assign(new Error(fields.message), fields)),
  fc.string({ maxLength: 40 }).map((msg) => msg),
  fc.integer().map((n) => n),
);

describe('Feature: email-delivery, Property 5: Falha do transport propaga', () => {
  // Silencia (e observa) o log de diagnóstico feito via console.error na falha.
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendMailMock.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('rejeita (propaga) sempre que transport.sendMail rejeita, nunca resolvendo silenciosamente', async () => {
    await fc.assert(
      fc.asyncProperty(messageArb, rejectionArb, async (message, rejection) => {
        // Reset por iteração (fast-check reusa o mesmo mock entre execuções).
        sendMailMock.mockReset();
        sendMailMock.mockRejectedValueOnce(rejection);

        const provider = new SmtpEmailProvider(CONFIG);

        // `send` deve rejeitar — e com o mesmo erro produzido pelo transport,
        // provando que não houve resolução silenciosa nem substituição do erro.
        let resolvedSilently = false;
        let caught: unknown;
        try {
          await provider.send(message);
          resolvedSilently = true;
        } catch (err) {
          caught = err;
        }

        expect(resolvedSilently).toBe(false);
        expect(caught).toBe(rejection);
        // O transport foi de fato acionado exatamente uma vez.
        expect(sendMailMock).toHaveBeenCalledTimes(1);
      }),
      { numRuns: 100 },
    );
  });
});
