import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { loadSmtpConfig } from '../../services/email/smtp-config.js';

/**
 * Feature: email-delivery, Property 3: Configuração válida faz parse fiel
 *
 * Para qualquer conjunto de variáveis com todas as obrigatórias preenchidas e
 * `SMTP_PORT` na faixa válida (1..65535), `loadSmtpConfig` SHALL retornar uma
 * `SmtpConfig` cujos campos correspondam exatamente aos valores de entrada
 * (com as strings obrigatórias trimadas pelo loader), com `port` numérico e
 * `secure` refletindo `SMTP_SECURE` (default `false` quando ausente).
 *
 * **Validates: Requirements 2.1, 2.2, 2.4**
 */

const MIN_PORT = 1;
const MAX_PORT = 65_535;

// Um valor obrigatório válido é qualquer string cujo trim não seja vazio.
// O loader trima os valores, então as asserções comparam contra o trim.
const requiredValueArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .filter((s) => s.trim() !== '');

// SMTP_SECURE: mapeia o valor bruto ao booleano esperado.
// ausente / '' / 'false' / '0' → false ; 'true' / '1' → true (case-insensitive).
const secureCaseArb = fc.oneof(
  fc.constant({ raw: undefined as string | undefined, expected: false }),
  fc.constant({ raw: '', expected: false }),
  fc.constant({ raw: 'false', expected: false }),
  fc.constant({ raw: 'FALSE', expected: false }),
  fc.constant({ raw: '0', expected: false }),
  fc.constant({ raw: 'true', expected: true }),
  fc.constant({ raw: 'TRUE', expected: true }),
  fc.constant({ raw: '1', expected: true }),
  fc.constant({ raw: '  true  ', expected: true }),
);

const validEnvArb = fc.record({
  host: requiredValueArb,
  user: requiredValueArb,
  pass: requiredValueArb,
  from: requiredValueArb,
  port: fc.integer({ min: MIN_PORT, max: MAX_PORT }),
  secureCase: secureCaseArb,
});

describe('Feature: email-delivery, Property 3: Configuração válida faz parse fiel', () => {
  it('retorna SmtpConfig fiel para qualquer configuração válida', () => {
    fc.assert(
      fc.property(validEnvArb, ({ host, user, pass, from, port, secureCase }) => {
        const env: NodeJS.ProcessEnv = {
          SMTP_HOST: host,
          SMTP_USER: user,
          SMTP_PASS: pass,
          SMTP_FROM: from,
          SMTP_PORT: String(port),
        };
        if (secureCase.raw !== undefined) {
          env.SMTP_SECURE = secureCase.raw;
        }

        const config = loadSmtpConfig(env);

        // Strings obrigatórias refletidas (o loader trima os valores).
        expect(config.host).toBe(host.trim());
        expect(config.user).toBe(user.trim());
        expect(config.pass).toBe(pass.trim());
        expect(config.from).toBe(from.trim());

        // Porta numérica e igual ao valor informado.
        expect(typeof config.port).toBe('number');
        expect(config.port).toBe(port);

        // secure reflete SMTP_SECURE (default false quando ausente).
        expect(typeof config.secure).toBe('boolean');
        expect(config.secure).toBe(secureCase.expected);
      }),
      { numRuns: 100 },
    );
  });

  it('port cobre os limites válidos 1 e 65535', () => {
    fc.assert(
      fc.property(fc.constantFrom(MIN_PORT, MAX_PORT), (port) => {
        const config = loadSmtpConfig({
          SMTP_HOST: 'smtp.example.com',
          SMTP_USER: 'user',
          SMTP_PASS: 'pass',
          SMTP_FROM: 'from@example.com',
          SMTP_PORT: String(port),
        });
        expect(config.port).toBe(port);
        expect(config.secure).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
