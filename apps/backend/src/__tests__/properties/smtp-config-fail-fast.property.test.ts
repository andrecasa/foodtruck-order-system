import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { loadSmtpConfig, ServiceError } from '../../services/email/smtp-config.js';

/**
 * Feature: email-delivery, Property 1: Configuração incompleta sempre falha (fail-fast)
 *
 * Para qualquer ambiente em que pelo menos uma das variáveis obrigatórias
 * (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) esteja ausente, vazia ou
 * composta apenas de espaços, `loadSmtpConfig` deve lançar um `ServiceError` em
 * pt-BR e nunca retornar uma `SmtpConfig`.
 *
 * **Validates: Requirements 2.3**
 */

/** Variáveis obrigatórias cuja ausência/vazio deve disparar o fail-fast. */
const REQUIRED_VARS = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;
type RequiredVar = (typeof REQUIRED_VARS)[number];

/** `code` esperado nas falhas de configuração SMTP. */
const SMTP_CONFIG_ERROR = 'SMTP_CONFIG_ERROR';

/**
 * Gera valores "presentes e válidos" para uma variável obrigatória: strings não
 * vazias que contêm ao menos um caractere não-espaço (para não colidirem com o
 * caso de valor ausente/vazio/só-espaços que estamos testando).
 */
/**
 * Gera valores "ausentes/vazios/só-espaços" para uma variável obrigatória:
 * - `undefined` (variável ausente do ambiente)
 * - `''` (string vazia)
 * - somente espaços em branco (espaços, tabs, quebras de linha)
 */
const whitespaceOnlyArb = fc
  .array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 6 })
  .map((chars) => chars.join(''));

const missingValueArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  whitespaceOnlyArb,
);

/** Porta válida, para que a falha venha exclusivamente da variável obrigatória vazia. */
const validPortArb = fc.integer({ min: 1, max: 65_535 }).map(String);

/**
 * Constrói um `env` no qual as variáveis obrigatórias recebem valores válidos,
 * exceto o subconjunto `invalidVars`, que recebe valores ausentes/vazios/só-espaços.
 */
function buildEnv(
  invalidVars: RequiredVar[],
  overrides: Partial<Record<RequiredVar, string | undefined>>,
  port: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { SMTP_PORT: port };

  for (const name of REQUIRED_VARS) {
    if (invalidVars.includes(name)) {
      const value = overrides[name];
      if (value !== undefined) {
        env[name] = value;
      }
      // value === undefined → variável simplesmente ausente do env
    } else {
      env[name] = `valido-${name.toLowerCase()}`;
    }
  }

  return env;
}

/** Verifica que o erro lançado é o `ServiceError` fail-fast esperado (pt-BR). */
function expectFailFast(fn: () => unknown): void {
  let thrown: unknown;
  let returned: unknown;
  try {
    returned = fn();
  } catch (err) {
    thrown = err;
  }

  // Nunca retorna uma SmtpConfig quando a configuração está incompleta.
  expect(returned).toBeUndefined();

  // Lança um ServiceError com o code padronizado.
  expect(thrown).toBeInstanceOf(ServiceError);
  const error = thrown as ServiceError;
  expect(error.code).toBe(SMTP_CONFIG_ERROR);

  // Mensagem em pt-BR, prefixada pelo texto padrão de configuração inválida.
  expect(error.message).toContain('Configuração SMTP inválida');
}

describe('Feature: email-delivery, Property 1: Configuração incompleta sempre falha (fail-fast)', () => {
  it('lança ServiceError pt-BR quando ao menos uma obrigatória está ausente/vazia/só-espaços', () => {
    fc.assert(
      fc.property(
        // Escolhe um subconjunto NÃO vazio das obrigatórias para invalidar.
        fc
          .subarray([...REQUIRED_VARS], { minLength: 1 })
          .chain((invalidVars) =>
            fc.record(
              Object.fromEntries(
                invalidVars.map((name) => [name, missingValueArb] as const),
              ) as Record<RequiredVar, typeof missingValueArb>,
            ).map((overrides) => ({ invalidVars, overrides })),
          ),
        validPortArb,
        ({ invalidVars, overrides }, port) => {
          const env = buildEnv(invalidVars, overrides, port);
          expectFailFast(() => loadSmtpConfig(env));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('lança ServiceError pt-BR mesmo quando apenas uma única obrigatória está inválida', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...REQUIRED_VARS),
        missingValueArb,
        validPortArb,
        (target, badValue, port) => {
          const overrides = { [target]: badValue } as Partial<
            Record<RequiredVar, string | undefined>
          >;
          const env = buildEnv([target], overrides, port);
          expectFailFast(() => loadSmtpConfig(env));
        },
      ),
      { numRuns: 100 },
    );
  });
});
