/**
 * Carregador de configuração SMTP (fail-fast) para o Provedor_SMTP.
 *
 * Lê a Configuracao_SMTP de `process.env` e valida de forma fail-fast: se
 * qualquer variável obrigatória estiver ausente, vazia ou inválida, lança um
 * `ServiceError` (pt-BR) que impede o backend de subir. NÃO faz fallback para
 * o NoopEmailProvider (design.md — "Decisão de projeto central — fail-fast").
 *
 * ESM com sufixo `.js` nos imports, como no restante de `apps/backend`.
 *
 * Nota (forward-looking): o backend ainda não possui um módulo compartilhado de
 * erros — cada serviço declara sua própria `ServiceError` local (ver
 * `user.service.ts`, `order.service.ts`, `password-reset.service.ts`). Este
 * módulo segue essa convenção com uma `ServiceError` local. Isso é intencional
 * por ora; uma spec futura centralizará `ServiceError` em um módulo compartilhado.
 */

// --- Error classes ---

import { ServiceError } from '../service-error.js';
export { ServiceError };

// --- Constants ---

/** `code` das falhas de configuração SMTP (fail-fast). */
const SMTP_CONFIG_ERROR = 'SMTP_CONFIG_ERROR';

/** `statusCode` associado às falhas de configuração (erro de servidor/inicialização). */
const SMTP_CONFIG_STATUS = 500;

/** Menor porta TCP válida. */
const MIN_PORT = 1;

/** Maior porta TCP válida. */
const MAX_PORT = 65_535;

// --- Types ---

export interface SmtpConfig {
  host: string;
  port: number; // 1..65535
  user: string;
  pass: string;
  from: string;
  secure: boolean; // true = TLS implícito (porta 465); false = STARTTLS (587)
}

// --- Helpers ---

/** Lança um `ServiceError` de configuração SMTP com o `code` padronizado. */
function configError(message: string): never {
  throw new ServiceError(
    `Configuração SMTP inválida: ${message}`,
    SMTP_CONFIG_STATUS,
    SMTP_CONFIG_ERROR,
  );
}

/**
 * Retorna o valor de uma variável obrigatória, garantindo que não seja
 * `undefined`, vazio ou composto apenas de espaços em branco. A mensagem cita
 * o NOME da variável, nunca o valor (R6.1).
 */
function requireNonEmpty(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    configError(`a variável ${name} é obrigatória e não pode estar vazia.`);
  }
  return value.trim();
}

/**
 * Faz o parse tolerante de `SMTP_SECURE`:
 * - `'true'`/`'1'` → `true`
 * - `'false'`/`'0'`/ausente → `false`
 * - qualquer outro valor não vazio → erro fail-fast (evita ambiguidade).
 */
function parseSecure(rawSecure: string | undefined): boolean {
  if (rawSecure === undefined) {
    return false;
  }

  const normalized = rawSecure.trim().toLowerCase();
  switch (normalized) {
    case '':
    case 'false':
    case '0':
      return false;
    case 'true':
    case '1':
      return true;
    default:
      return configError(
        'SMTP_SECURE deve ser "true", "1", "false" ou "0".',
      );
  }
}

/**
 * Faz o parse e valida `SMTP_PORT`: obrigatória, deve ser um inteiro na faixa
 * 1..65535 (R2.5). A mensagem nunca inclui o valor informado.
 */
function parsePort(rawPort: string | undefined): number {
  const trimmed = (rawPort ?? '').trim();

  // Aceita apenas dígitos: rejeita floats, sinais, notação científica etc.
  if (!/^\d+$/.test(trimmed)) {
    return configError(
      'SMTP_PORT deve ser um número de porta válido entre 1 e 65535.',
    );
  }

  const port = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return configError(
      'SMTP_PORT deve ser um número de porta válido entre 1 e 65535.',
    );
  }

  return port;
}

// --- Loader ---

/**
 * Lê e valida a Configuracao_SMTP a partir do ambiente.
 *
 * Fail-fast: lança `ServiceError` (pt-BR, `code` `SMTP_CONFIG_ERROR`) se qualquer
 * variável obrigatória estiver ausente, vazia ou inválida. NÃO faz fallback para
 * o NoopEmailProvider.
 */
export function loadSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = requireNonEmpty(env, 'SMTP_HOST');
  const user = requireNonEmpty(env, 'SMTP_USER');
  const pass = requireNonEmpty(env, 'SMTP_PASS');
  const from = requireNonEmpty(env, 'SMTP_FROM');

  const port = parsePort(env.SMTP_PORT);
  const secure = parseSecure(env.SMTP_SECURE);

  return { host, port, user, pass, from, secure };
}
