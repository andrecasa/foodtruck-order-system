import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { loadSmtpConfig, ServiceError } from '../../services/email/smtp-config.js';

/**
 * Teste de propriedade para o carregador de configuração SMTP (`loadSmtpConfig`).
 *
 * Feature: email-delivery, Property 2: Porta inválida sempre falha
 *   Para qualquer valor de `SMTP_PORT` que não represente um inteiro na faixa de
 *   1 a 65535 (não numérico, ≤ 0, > 65535 ou fracionário), `loadSmtpConfig` deve
 *   lançar um `ServiceError` em pt-BR, mesmo quando todas as demais variáveis
 *   obrigatórias forem válidas.
 *
 * Validates: Requirements 2.5
 */

/** Base de variáveis obrigatórias SEMPRE válidas (isola a dimensão da porta). */
const VALID_BASE_ENV: NodeJS.ProcessEnv = {
  SMTP_HOST: 'smtp.exemplo.com',
  SMTP_USER: 'usuario@exemplo.com',
  SMTP_PASS: 'senha-de-app',
  SMTP_FROM: 'no-reply@exemplo.com',
};

/**
 * Gera valores de `SMTP_PORT` que NÃO representam um inteiro válido em 1..65535.
 * Cobre as quatro classes citadas no design: não numérico, ≤ 0, > 65535 e
 * fracionário.
 */
const invalidPortArb = fc.oneof(
  // Não numérico (texto arbitrário sem ser um inteiro puro positivo).
  fc
    .string()
    .filter((s) => !/^\d+$/.test(s.trim()) || s.trim() === ''),
  // ≤ 0 (zero e negativos), serializados como string.
  fc.integer({ min: -100000, max: 0 }).map((n) => String(n)),
  // > 65535 (acima da faixa válida).
  fc.integer({ min: 65536, max: 10_000_000 }).map((n) => String(n)),
  // Fracionário (contém ponto decimal).
  fc
    .float({ min: Math.fround(0.0001), max: Math.fround(70000), noNaN: true })
    .filter((n) => !Number.isInteger(n))
    .map((n) => String(n)),
  // Casos textuais explícitos que costumam ser mal-parseados.
  fc.constantFrom('abc', '12abc', '+587', ' 587 x', '5e2', '0x1BB', 'NaN', 'Infinity', ''),
);

describe('loadSmtpConfig — porta inválida (Property 2)', () => {
  it('Property 2: lança ServiceError pt-BR para qualquer SMTP_PORT inválida', () => {
    fc.assert(
      fc.property(invalidPortArb, (rawPort) => {
        const env: NodeJS.ProcessEnv = {
          ...VALID_BASE_ENV,
          SMTP_PORT: rawPort,
        };

        let thrown: unknown;
        try {
          loadSmtpConfig(env);
        } catch (err) {
          thrown = err;
        }

        // Deve SEMPRE lançar (nunca retornar uma SmtpConfig).
        expect(thrown).toBeInstanceOf(ServiceError);
        const error = thrown as ServiceError;
        expect(error.code).toBe('SMTP_CONFIG_ERROR');
        // Mensagem em pt-BR citando a variável, nunca o valor informado.
        expect(error.message).toContain('SMTP_PORT');
        expect(error.message).toContain('Configuração SMTP inválida');
      }),
      { numRuns: 100 },
    );
  });

  it('Property 2: também falha quando SMTP_PORT está ausente', () => {
    // Ausência é tratada como porta inválida (fail-fast).
    const env: NodeJS.ProcessEnv = { ...VALID_BASE_ENV };
    expect(() => loadSmtpConfig(env)).toThrow(ServiceError);
  });
});
