import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { Request, Response } from 'express';
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } from '@order-system/shared';
import {
  forgotPasswordRateLimit,
  ipBuckets,
  emailBuckets,
} from '../../middleware/forgot-password-rate-limit.middleware.js';

/**
 * Testes de propriedade para o middleware `forgotPasswordRateLimit`.
 *
 * Feature: forgot-password, Property 9: Rate limit por e-mail
 *   Para qualquer sequência de solicitações do mesmo e-mail que atinja 5 dentro
 *   da Janela_Solicitacao de 15 minutos, toda solicitação adicional desse
 *   e-mail no restante da janela deve ser recusada sem gerar novo código.
 *
 * Feature: forgot-password, Property 10: Rate limit por IP
 *   Para qualquer sequência de solicitações do mesmo IP que atinja 5 dentro da
 *   Janela_Solicitacao de 15 minutos, toda solicitação adicional desse IP no
 *   restante da janela deve ser recusada.
 *
 * Feature: forgot-password, Property 11: Reset da janela de rate limit
 *   Para qualquer e-mail ou IP, uma vez encerrada a Janela_Solicitacao de 15
 *   minutos, a contagem reinicia em 0 e novas solicitações voltam a ser aceitas.
 *
 * Feature: forgot-password, Property 12: Recusa por rate limit não altera estado
 *   Para qualquer solicitação recusada por rate limit, o conjunto de códigos
 *   válidos e de solicitações já registradas deve permanecer inalterado.
 *
 * Validates: Requirements 2.8, 4.1, 4.2, 4.3, 4.5
 */

const NEUTRAL_MESSAGE =
  'Se o e-mail estiver cadastrado, enviamos instruções para redefinir a senha.';

interface MockResult {
  statusCode: number | null;
  body: unknown;
  nextCalled: boolean;
}

/**
 * Constrói req/res/next simulados e executa o middleware uma vez.
 * - Se o middleware chamar `next()`, a solicitação foi ACEITA.
 * - Se responder via `res.status().json()`, a solicitação foi RECUSADA.
 */
function runMiddleware(ip: string, email: string): MockResult {
  const result: MockResult = { statusCode: null, body: null, nextCalled: false };

  const req = {
    ip,
    socket: { remoteAddress: ip },
    headers: {},
    body: { email },
  } as unknown as Request;

  const res = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload;
      return this;
    },
  } as unknown as Response;

  forgotPasswordRateLimit(req, res, () => {
    result.nextCalled = true;
  });

  return result;
}

/** Gera e-mail e IP determinísticos por índice, para chaves estáveis por teste. */
const emailArb = fc
  .tuple(fc.stringMatching(/^[a-z0-9]{1,12}$/), fc.constantFrom('exemplo.com', 'teste.com.br'))
  .map(([local, domain]) => `${local}@${domain}`);

const ipArb = fc
  .tuple(
    fc.integer({ min: 1, max: 254 }),
    fc.integer({ min: 0, max: 254 }),
    fc.integer({ min: 0, max: 254 }),
    fc.integer({ min: 1, max: 254 }),
  )
  .map((octets) => octets.join('.'));

describe('forgotPasswordRateLimit — rate limit (Properties 9–12)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Cada teste começa com os buckets limpos para não vazar estado entre casos.
    ipBuckets.clear();
    emailBuckets.clear();
  });

  afterEach(() => {
    ipBuckets.clear();
    emailBuckets.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /**
   * Property 9: Rate limit por e-mail.
   *
   * Usamos IPs distintos em cada solicitação para isolar a dimensão de e-mail,
   * garantindo que o bloqueio observado venha exclusivamente do bucket de e-mail.
   */
  it('Property 9: bloqueia ao atingir 5 solicitações do mesmo e-mail na janela', () => {
    fc.assert(
      fc.property(emailArb, (email) => {
        ipBuckets.clear();
        emailBuckets.clear();

        // As primeiras 5 solicitações (limite) são aceitas.
        for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
          const res = runMiddleware(`10.0.0.${i + 1}`, email);
          expect(res.nextCalled).toBe(true);
          expect(res.statusCode).toBeNull();
        }

        // A 6ª (e seguintes) do mesmo e-mail é recusada com a Mensagem_Neutra.
        for (let i = 0; i < 3; i++) {
          const res = runMiddleware(`10.9.9.${i + 1}`, email);
          expect(res.nextCalled).toBe(false);
          expect(res.statusCode).toBe(200);
          expect(res.body).toEqual({ message: NEUTRAL_MESSAGE });
        }

        // O bucket do e-mail permanece capado no limite (recusas não gravam).
        const normalized = email.trim().toLowerCase();
        expect(emailBuckets.get(normalized)?.timestamps.length).toBe(RATE_LIMIT_MAX_ATTEMPTS);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 10: Rate limit por IP.
   *
   * Usamos e-mails distintos em cada solicitação para isolar a dimensão de IP.
   */
  it('Property 10: bloqueia ao atingir 5 solicitações do mesmo IP na janela', () => {
    fc.assert(
      fc.property(ipArb, (ip) => {
        ipBuckets.clear();
        emailBuckets.clear();

        for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
          const res = runMiddleware(ip, `user${i}@exemplo.com`);
          expect(res.nextCalled).toBe(true);
          expect(res.statusCode).toBeNull();
        }

        for (let i = 0; i < 3; i++) {
          const res = runMiddleware(ip, `extra${i}@exemplo.com`);
          expect(res.nextCalled).toBe(false);
          expect(res.statusCode).toBe(200);
          expect(res.body).toEqual({ message: NEUTRAL_MESSAGE });
        }

        expect(ipBuckets.get(ip)?.timestamps.length).toBe(RATE_LIMIT_MAX_ATTEMPTS);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 11: Reset da janela de rate limit.
   *
   * Após atingir o limite, avançamos o relógio falso além da janela de 15 min;
   * a contagem reinicia e novas solicitações voltam a ser aceitas.
   */
  it('Property 11: reinicia a contagem após o fim da janela de 15 minutos', () => {
    fc.assert(
      fc.property(emailArb, ipArb, (email, ip) => {
        ipBuckets.clear();
        emailBuckets.clear();

        // Satura tanto e-mail quanto IP no mesmo par para exercitar ambas as dimensões.
        for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
          const res = runMiddleware(ip, email);
          expect(res.nextCalled).toBe(true);
        }

        // Dentro da janela: recusa.
        const blocked = runMiddleware(ip, email);
        expect(blocked.nextCalled).toBe(false);
        expect(blocked.statusCode).toBe(200);

        // Avança além da janela (reset natural por expiração dos timestamps).
        vi.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1);

        // Nova solicitação é novamente aceita.
        const accepted = runMiddleware(ip, email);
        expect(accepted.nextCalled).toBe(true);
        expect(accepted.statusCode).toBeNull();

        // A contagem reiniciou: apenas a solicitação recém-aceita permanece.
        const normalized = email.trim().toLowerCase();
        expect(emailBuckets.get(normalized)?.timestamps.length).toBe(1);
        expect(ipBuckets.get(ip)?.timestamps.length).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Property 12: Recusa por rate limit não altera estado.
   *
   * Após atingir o limite, capturamos o estado dos buckets; cada solicitação
   * recusada não deve gravar novos timestamps nem alterar os existentes.
   */
  it('Property 12: recusas por rate limit não alteram o estado registrado', () => {
    fc.assert(
      fc.property(emailArb, ipArb, fc.integer({ min: 1, max: 5 }), (email, ip, extraRefusals) => {
        ipBuckets.clear();
        emailBuckets.clear();

        for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
          const res = runMiddleware(ip, email);
          expect(res.nextCalled).toBe(true);
        }

        const normalized = email.trim().toLowerCase();
        // Snapshot do estado imediatamente após atingir o limite.
        const emailSnapshot = [...(emailBuckets.get(normalized)?.timestamps ?? [])];
        const ipSnapshot = [...(ipBuckets.get(ip)?.timestamps ?? [])];

        // Solicitações recusadas repetidas não devem modificar o estado.
        for (let i = 0; i < extraRefusals; i++) {
          const res = runMiddleware(ip, email);
          expect(res.nextCalled).toBe(false);
          expect(res.statusCode).toBe(200);
        }

        expect(emailBuckets.get(normalized)?.timestamps).toEqual(emailSnapshot);
        expect(ipBuckets.get(ip)?.timestamps).toEqual(ipSnapshot);
        expect(emailSnapshot.length).toBe(RATE_LIMIT_MAX_ATTEMPTS);
        expect(ipSnapshot.length).toBe(RATE_LIMIT_MAX_ATTEMPTS);
      }),
      { numRuns: 100 },
    );
  });
});
