import { describe, it, expect } from 'vitest';
import { type Request, type Response } from 'express';
import {
  signupRateLimiter,
  SIGNUP_RATE_LIMIT_MAX,
  SIGNUP_RATE_LIMIT_WINDOW_MS,
} from '../../middleware/signup-rate-limit.middleware.js';

/**
 * Testes do `signupRateLimiter` (R9.4/R9.5).
 *
 * Exercitam o middleware real do `express-rate-limit` chamando-o em sequência
 * para o mesmo IP: as primeiras `SIGNUP_RATE_LIMIT_MAX` requisições passam
 * (chamam `next`) e a seguinte é recusada com o Error_Envelope 429 em pt-BR,
 * sem chamar `next` (nenhum efeito colateral).
 */

function mockRequest(ip: string): Partial<Request> {
  return {
    ip,
    headers: {},
    socket: { remoteAddress: ip } as never,
  };
}

interface MockResponse extends Partial<Response> {
  statusCode: number;
  body: unknown;
}

function mockResponse(): MockResponse {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
    // express-rate-limit define cabeçalhos RateLimit-*; no-op para o mock.
    setHeader() {
      return res;
    },
    getHeader() {
      return undefined;
    },
    append() {
      return res;
    },
  };
  return res as unknown as MockResponse;
}

/**
 * Executa o middleware uma vez e resolve quando `next` for chamado (aceito) ou
 * quando a resposta for escrita (recusado). `express-rate-limit` v8 usa store
 * assíncrono, então a decisão pode chegar num microtask posterior.
 */
function runOnce(ip: string): Promise<{ nextCalled: boolean; res: MockResponse }> {
  return new Promise((resolve) => {
    const req = mockRequest(ip) as Request;
    const res = mockResponse();
    let settled = false;

    const originalJson = res.json.bind(res);
    res.json = (data: unknown) => {
      const out = originalJson(data);
      if (!settled) {
        settled = true;
        resolve({ nextCalled: false, res });
      }
      return out;
    };

    signupRateLimiter(req, res as unknown as Response, () => {
      if (!settled) {
        settled = true;
        resolve({ nextCalled: true, res });
      }
    });
  });
}

describe('signupRateLimiter (R9.4/R9.5)', () => {
  it('usa janela de 15 minutos e limite de 5 por IP (constantes nomeadas)', () => {
    expect(SIGNUP_RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(SIGNUP_RATE_LIMIT_MAX).toBe(5);
  });

  it('permite até SIGNUP_RATE_LIMIT_MAX requisições e recusa a seguinte com 429 pt-BR', async () => {
    const ip = '203.0.113.10';

    for (let i = 0; i < SIGNUP_RATE_LIMIT_MAX; i += 1) {
      const { nextCalled } = await runOnce(ip);
      expect(nextCalled).toBe(true);
    }

    const { nextCalled, res } = await runOnce(ip);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({
      statusCode: 429,
      error: 'TOO_MANY_REQUESTS',
      message: expect.stringMatching(/tentativas de cadastro/i),
    });
  });

  it('conta o limite por IP de forma independente', async () => {
    const blockedIp = '203.0.113.20';
    const freshIp = '203.0.113.21';

    for (let i = 0; i < SIGNUP_RATE_LIMIT_MAX; i += 1) {
      await runOnce(blockedIp);
    }
    const blocked = await runOnce(blockedIp);
    expect(blocked.res.statusCode).toBe(429);

    // Um IP diferente ainda está dentro do limite.
    const fresh = await runOnce(freshIp);
    expect(fresh.nextCalled).toBe(true);
  });
});
