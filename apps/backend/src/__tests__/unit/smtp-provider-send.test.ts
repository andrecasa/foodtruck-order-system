import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes de exemplo para o `SmtpEmailProvider.send` via transport mockado
 * (`nodemailer` mockado com `vi.mock('nodemailer')`).
 *
 * Cobrem:
 * - transport resolve → `send` resolve (R3.1, R3.2).
 * - transport rejeita → `send` rejeita (R3.3) e o log de erro NÃO vaza
 *   `SMTP_PASS`/body/html/código de verificação (R6.1–R6.3, R6.5).
 * - mensagem com `html` presente → payload multipart (inclui `html`) (R3.5).
 * - mensagem sem `html` → payload somente-texto (sem chave `html`) (R3.6).
 * - `secure: true` é repassado a `createTransport` (R2.4).
 *
 * O transport do `nodemailer` é mockado para não abrir conexões reais.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 3.6, 2.4, 6.1, 6.2, 6.3, 6.5**
 */

// Mock do nodemailer: `createTransport` retorna um transport com `sendMail`
// controlável. Exportado tanto como default quanto nomeado para cobrir os dois
// estilos de import.
const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => mockCreateTransport(...args) },
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import { SmtpEmailProvider } from '../../services/email/smtp-email.provider.js';
import type { SmtpConfig } from '../../services/email/smtp-config.js';
import type { EmailMessage } from '../../services/email/email.service.js';

const SMTP_PASS = 'super-secret-app-password';

const BASE_CONFIG: SmtpConfig = {
  host: 'smtp.example.com',
  port: 587,
  user: 'no-reply@example.com',
  pass: SMTP_PASS,
  from: 'Plataforma <no-reply@example.com>',
  secure: false,
};

const CODE = '654321';

const TEXT_ONLY_MESSAGE: EmailMessage = {
  to: 'usuario@example.com',
  subject: 'Código de verificação para redefinir sua senha',
  body: `Seu código de verificação é ${CODE}. Ele expira em 15 minutos.`,
};

const HTML_MESSAGE: EmailMessage = {
  ...TEXT_ONLY_MESSAGE,
  html: `<p>Seu código de verificação é <strong>${CODE}</strong>.</p>`,
};

describe('SmtpEmailProvider.send (transport mockado)', () => {
  beforeEach(() => {
    mockSendMail.mockReset();
    mockCreateTransport.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NODE_ENV;
  });

  it('resolve quando o transport resolve (R3.1, R3.2)', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'ok' });
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await expect(provider.send(TEXT_ONLY_MESSAGE)).resolves.toBeUndefined();
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('repassa secure: true a createTransport quando habilitado (R2.4)', () => {
    new SmtpEmailProvider({ ...BASE_CONFIG, secure: true });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: BASE_CONFIG.host,
        port: BASE_CONFIG.port,
        secure: true,
        auth: { user: BASE_CONFIG.user, pass: BASE_CONFIG.pass },
      }),
    );
  });

  it('monta payload multipart quando há html (text + html) (R3.5)', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'ok' });
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await provider.send(HTML_MESSAGE);

    const payload = mockSendMail.mock.calls[0][0];
    expect(payload.from).toBe(BASE_CONFIG.from);
    expect(payload.to).toBe(HTML_MESSAGE.to);
    expect(payload.subject).toBe(HTML_MESSAGE.subject);
    expect(payload.text).toBe(HTML_MESSAGE.body);
    expect(payload.html).toBe(HTML_MESSAGE.html);
  });

  it('monta payload somente-texto quando não há html (sem chave html) (R3.6)', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'ok' });
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await provider.send(TEXT_ONLY_MESSAGE);

    const payload = mockSendMail.mock.calls[0][0];
    expect(payload.text).toBe(TEXT_ONLY_MESSAGE.body);
    expect('html' in payload).toBe(false);
  });

  it('trata html vazio como somente-texto (sem chave html) (R3.6)', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'ok' });
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await provider.send({ ...TEXT_ONLY_MESSAGE, html: '' });

    const payload = mockSendMail.mock.calls[0][0];
    expect('html' in payload).toBe(false);
  });

  it('rejeita quando o transport rejeita (R3.3)', async () => {
    const failure = new Error('connection refused');
    mockSendMail.mockRejectedValue(failure);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await expect(provider.send(TEXT_ONLY_MESSAGE)).rejects.toBe(failure);
  });

  it('não vaza SMTP_PASS/body/html/código nos logs em falha, não-produção (R6.1, R6.3, R6.5)', async () => {
    // Erro de SMTP típico com campos de diagnóstico; a mensagem crua NÃO contém segredos.
    const failure = Object.assign(new Error('535 auth failed'), {
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.8 Authentication failed',
    });
    mockSendMail.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await expect(provider.send(HTML_MESSAGE)).rejects.toBe(failure);

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');

    // Nunca vaza a senha SMTP nem o corpo/HTML/código de verificação.
    expect(logged).not.toContain(SMTP_PASS);
    expect(logged).not.toContain(HTML_MESSAGE.body);
    expect(logged).not.toContain(HTML_MESSAGE.html);
    expect(logged).not.toContain(CODE);

    // Mas registra diagnóstico útil (host).
    expect(logged).toContain(BASE_CONFIG.host);
  });

  it('em produção não vaza SMTP_PASS/body/html/código nos logs em falha (R6.2, R6.5)', async () => {
    process.env.NODE_ENV = 'production';
    const failure = Object.assign(new Error('535 auth failed'), {
      code: 'EAUTH',
      responseCode: 535,
      response: '535 5.7.8 Authentication failed',
    });
    mockSendMail.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = new SmtpEmailProvider(BASE_CONFIG);

    await expect(provider.send(HTML_MESSAGE)).rejects.toBe(failure);

    const logged = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(logged).not.toContain(SMTP_PASS);
    expect(logged).not.toContain(HTML_MESSAGE.body);
    expect(logged).not.toContain(HTML_MESSAGE.html);
    expect(logged).not.toContain(CODE);
    expect(logged).toContain(BASE_CONFIG.host);
  });
});
