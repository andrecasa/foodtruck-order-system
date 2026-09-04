import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import type { EmailMessage } from '../../services/email/email.service.js';
import type { SmtpConfig } from '../../services/email/smtp-config.js';

/**
 * Testes de propriedade para o `SmtpEmailProvider` — montagem do payload.
 *
 * Feature: email-delivery, Property 4: Payload preserva conteúdo da mensagem
 *   Para qualquer EmailMessage (`to`, `subject`, `body` arbitrários, com `html`
 *   presente ou ausente), o payload passado a `transport.sendMail` deve conter
 *   `to`, `subject` e `text` idênticos aos campos da mensagem, `from` igual ao
 *   `SMTP_FROM` da configuração, e o campo `html` presente no payload se e
 *   somente se `message.html` estiver presente (e não vazio), com valor
 *   idêntico — sem remover nem alterar assunto, corpo texto ou corpo HTML.
 *
 * Validates: Requirements 3.4, 3.5, 3.6, 4.2
 *
 * O transport do `nodemailer` é mockado (`vi.mock('nodemailer')`) para não abrir
 * conexões reais: `createTransport` devolve um transport cujo `sendMail` é um spy.
 */

// Spy compartilhado usado pelo transport mockado; capturamos o payload enviado.
const sendMailSpy = vi.fn().mockResolvedValue({ messageId: 'mock' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailSpy })),
  },
}));

// Import dinâmico após o mock estar registrado.
const { SmtpEmailProvider } = await import('../../services/email/smtp-email.provider.js');

const configArb: fc.Arbitrary<SmtpConfig> = fc.record({
  host: fc.string({ minLength: 1, maxLength: 30 }),
  port: fc.integer({ min: 1, max: 65535 }),
  user: fc.string({ minLength: 1, maxLength: 30 }),
  pass: fc.string({ minLength: 1, maxLength: 30 }),
  from: fc.string({ minLength: 1, maxLength: 40 }),
  secure: fc.boolean(),
});

// Mensagens com `html` presente (não vazio) ou totalmente ausente.
const messageArb: fc.Arbitrary<EmailMessage> = fc
  .record({
    to: fc.string({ minLength: 1, maxLength: 40 }),
    subject: fc.string({ maxLength: 60 }),
    body: fc.string({ maxLength: 200 }),
    html: fc.oneof(fc.constant(undefined), fc.string({ minLength: 1, maxLength: 200 })),
  })
  .map((m) => (m.html === undefined ? { to: m.to, subject: m.subject, body: m.body } : m));

describe('SmtpEmailProvider — payload (Property 4)', () => {
  beforeEach(() => {
    sendMailSpy.mockClear();
    sendMailSpy.mockResolvedValue({ messageId: 'mock' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Property 4: preserva to/subject/text, define from=SMTP_FROM e inclui html iff presente', async () => {
    await fc.assert(
      fc.asyncProperty(configArb, messageArb, async (config, message) => {
        sendMailSpy.mockClear();

        const provider = new SmtpEmailProvider(config);
        await provider.send(message);

        expect(sendMailSpy).toHaveBeenCalledTimes(1);
        const payload = sendMailSpy.mock.calls[0][0] as Record<string, unknown>;

        // Campos preservados integralmente a partir da mensagem.
        expect(payload.to).toBe(message.to);
        expect(payload.subject).toBe(message.subject);
        expect(payload.text).toBe(message.body);

        // Remetente vem da Configuracao_SMTP (SMTP_FROM).
        expect(payload.from).toBe(config.from);

        // `html` presente no payload se e somente se `message.html` presente/não vazio.
        const hasHtmlInMessage = typeof message.html === 'string' && message.html.length > 0;
        if (hasHtmlInMessage) {
          expect('html' in payload).toBe(true);
          expect(payload.html).toBe(message.html);
        } else {
          expect('html' in payload).toBe(false);
        }
      }),
      { numRuns: 100 },
    );
  });
});
