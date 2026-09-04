import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes de exemplo para a resolução de provedor de e-mail
 * (`resolveEmailProvider`).
 *
 * Cobrem o switch de seleção por `EMAIL_PROVIDER`:
 * - `smtp` (e `SMTP` maiúsculo, case-insensitive) com config válida →
 *   instância de `SmtpEmailProvider` (R1.1).
 * - `smtp` com config SMTP inválida/ausente → lança (fail-fast) (R2.3).
 * - `noop` / ausente / vazio → `NoopEmailProvider` (R1.2, R5.2).
 * - `logging` → `LoggingEmailProvider` (R1.3, R5.1).
 * - valor desconhecido → `NoopEmailProvider` + `console.warn` (R1.4).
 *
 * O transport do `nodemailer` é mockado com `vi.mock('nodemailer')` para não
 * abrir conexões reais quando o caso `smtp` instancia o `SmtpEmailProvider`.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.3, 5.1, 5.2**
 */

const mockSendMail = vi.fn();
const mockCreateTransport = vi.fn(() => ({ sendMail: mockSendMail }));

vi.mock('nodemailer', () => ({
  default: { createTransport: (...args: unknown[]) => mockCreateTransport(...args) },
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
}));

import {
  resolveEmailProvider,
  NoopEmailProvider,
  LoggingEmailProvider,
} from '../../services/email/email.service.js';
import { SmtpEmailProvider } from '../../services/email/smtp-email.provider.js';
import { ServiceError } from '../../services/email/smtp-config.js';

/** Variáveis SMTP obrigatórias, usadas para montar um ambiente válido. */
const REQUIRED_SMTP_VARS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SMTP_SECURE',
] as const;

/** Snapshot das variáveis SMTP originais, restaurado após cada teste. */
const originalEnv: Record<string, string | undefined> = {};

/** Preenche `process.env` com uma Configuracao_SMTP válida. */
function setValidSmtpEnv(): void {
  process.env.SMTP_HOST = 'smtp.example.com';
  process.env.SMTP_PORT = '587';
  process.env.SMTP_USER = 'no-reply@example.com';
  process.env.SMTP_PASS = 'app-password';
  process.env.SMTP_FROM = 'Plataforma <no-reply@example.com>';
  process.env.SMTP_SECURE = 'false';
}

/** Remove todas as variáveis SMTP de `process.env`. */
function clearSmtpEnv(): void {
  for (const name of REQUIRED_SMTP_VARS) {
    delete process.env[name];
  }
}

describe('resolveEmailProvider', () => {
  beforeEach(() => {
    for (const name of REQUIRED_SMTP_VARS) {
      originalEnv[name] = process.env[name];
    }
    mockSendMail.mockReset();
    mockCreateTransport.mockClear();
  });

  afterEach(() => {
    // Restaura o ambiente SMTP original (evita vazamento entre testes).
    for (const name of REQUIRED_SMTP_VARS) {
      if (originalEnv[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = originalEnv[name];
      }
    }
    vi.restoreAllMocks();
  });

  it('resolve "smtp" com config válida para SmtpEmailProvider (R1.1)', () => {
    setValidSmtpEnv();

    const provider = resolveEmailProvider('smtp');

    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it('resolve "SMTP" (maiúsculo) para SmtpEmailProvider — case-insensitive (R1.1)', () => {
    setValidSmtpEnv();

    const provider = resolveEmailProvider('SMTP');

    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it('lança (fail-fast) quando "smtp" tem config SMTP inválida/ausente (R2.3)', () => {
    clearSmtpEnv();

    expect(() => resolveEmailProvider('smtp')).toThrow(ServiceError);
  });

  it('resolve "noop" para NoopEmailProvider (R1.2, R5.2)', () => {
    expect(resolveEmailProvider('noop')).toBeInstanceOf(NoopEmailProvider);
  });

  it('resolve ausente (undefined) para NoopEmailProvider (R1.2, R5.2)', () => {
    expect(resolveEmailProvider(undefined)).toBeInstanceOf(NoopEmailProvider);
  });

  it('resolve vazio ("") para NoopEmailProvider (R1.2, R5.2)', () => {
    expect(resolveEmailProvider('')).toBeInstanceOf(NoopEmailProvider);
  });

  it('resolve "logging" para LoggingEmailProvider (R1.3, R5.1)', () => {
    expect(resolveEmailProvider('logging')).toBeInstanceOf(LoggingEmailProvider);
  });

  it('resolve valor desconhecido para NoopEmailProvider e emite console.warn (R1.4)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const provider = resolveEmailProvider('carrier-pigeon');

    expect(provider).toBeInstanceOf(NoopEmailProvider);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
