import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

/**
 * Testes example-based do ENDPOINT de signup (task 9.5), focados na fiação da
 * stack HTTP — não na tradução HTTP↔serviço já coberta em
 * `signup-controller.test.ts` (task 9.3). Aqui exercitamos o encadeamento real
 * `signupRateLimiter → signupController → errorHandler`, montado como o
 * `signup.routes.ts` o faz em produção, para afirmar:
 *
 *  - rate-limit por IP: ao exceder `SIGNUP_RATE_LIMIT_MAX`, o endpoint responde
 *    429 pt-BR ANTES do controller, sem efeito colateral (o serviço não é
 *    chamado) — R9.4/R9.5;
 *  - 201 (cadastro novo) / 200 (reenvio idempotente) com `{ tenantId, slug,
 *    trialEndsAt }` — R9.6/R10.5 (poucas asserções, evitando duplicar 9.3);
 *  - método/Content-Type incorretos ⇒ rejeição pt-BR via Error_Envelope, sem
 *    efeito colateral — R9.7;
 *  - erro inesperado no serviço ⇒ 500 `INTERNAL_ERROR` pelo `errorHandler`
 *    central, sem vazar detalhes internos — R9.8.
 *
 * O `signup.service` é mockado (nenhum I/O real). O IP de cada teste é único
 * para não colidir com o store em memória do `express-rate-limit`, que é
 * compartilhado entre os testes deste arquivo.
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (API Contracts; Error
 *   Handling; sequência do `POST /api/signup`).
 * _Requirements: 9.5, 9.6, 9.7, 9.8, 10.5_
 */

// Mock do serviço de signup — o endpoint não deve produzir efeito real.
vi.mock('../../services/signup.service.js', () => ({
  signup: vi.fn(),
  checkSlugAvailability: vi.fn(),
}));

import { signupController } from '../../controllers/signup.controller.js';
import * as signupService from '../../services/signup.service.js';
import {
  signupRateLimiter,
  SIGNUP_RATE_LIMIT_MAX,
} from '../../middleware/signup-rate-limit.middleware.js';
import { asyncHandler } from '../../http/async-handler.js';
import { errorHandler } from '../../http/error-handler.js';

/** Campos de texto válidos do multipart (sem logo). */
const validBody = {
  businessName: 'Restaurante Teste',
  contactName: 'Maria Responsável',
  contactPhone: '+55 (11) 99999-1234',
  adminName: 'Admin Teste',
  adminEmail: 'admin@teste.com',
  password: 'senhaForte1',
  slug: 'restaurante-teste',
  colorPresetId: 'classico',
};

interface MockResponse extends Partial<Response> {
  statusCode: number;
  body: unknown;
}

/** Response Express mockada, capturando status e corpo JSON. */
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
    // express-rate-limit define cabeçalhos RateLimit-*; no-ops para o mock.
    setHeader() {
      return res;
    },
    getHeader() {
      return undefined;
    },
    append() {
      return res;
    },
    get headersSent() {
      return res.statusCode !== 0;
    },
  };
  return res as unknown as MockResponse;
}

/**
 * Request mockada no estilo do que o parser multipart entrega ao controller:
 * `headers` (com `content-type`), `body`, `file` opcional e o `ip`/`socket`
 * usados pelo `getClientIp` do rate limiter.
 */
function mockRequest(options: {
  ip: string;
  contentType?: string;
  body?: Record<string, unknown>;
  file?: { buffer: Buffer; mimetype: string; size: number };
}): Request {
  return {
    ip: options.ip,
    socket: { remoteAddress: options.ip } as never,
    headers: {
      'content-type': options.contentType ?? 'multipart/form-data; boundary=x',
    },
    body: options.body ?? { ...validBody },
    file: options.file,
  } as unknown as Request;
}

/**
 * Executa a stack do endpoint POST /api/signup exatamente como o
 * `signup.routes.ts` a monta: `signupRateLimiter → asyncHandler(controller)`,
 * com rejeições/erros encaminhados ao `errorHandler` central (via `next`),
 * espelhando o comportamento do Express em produção.
 *
 * O parser multipart é omitido de propósito — os testes já fornecem `req.file`
 * pronto (o mesmo que o multer entregaria) e o foco de 9.5 é a fiação
 * rate-limit/controller/error-handler, não o parsing em si.
 *
 * Resolve quando a resposta é escrita (`res.status(...)`) ou quando o controller
 * conclui sem responder, cobrindo o store assíncrono do `express-rate-limit`.
 */
function runEndpoint(req: Request): Promise<MockResponse> {
  const res = mockResponse();
  const wrappedController = asyncHandler(signupController);

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };

    // Captura a escrita da resposta (429 do limiter, 500 do errorHandler ou
    // 200/201 do controller) para resolver a Promise.
    const originalJson = res.json!.bind(res);
    res.json = (data: unknown) => {
      const out = originalJson(data);
      settle();
      return out;
    };

    const next: NextFunction = (err?: unknown) => {
      if (err) {
        errorHandler(err, req, res as unknown as Response, () => undefined);
        settle();
        return;
      }
      // Rate limiter liberou: segue para o controller.
      void Promise.resolve(
        wrappedController(req, res as unknown as Response, (asyncErr?: unknown) => {
          if (asyncErr) {
            errorHandler(asyncErr, req, res as unknown as Response, () => undefined);
          }
          settle();
        }),
      ).then(() => settle());
    };

    signupRateLimiter(req, res as unknown as Response, next);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/signup — fiação do endpoint (task 9.5)', () => {
  it('responde 201 { tenantId, slug, trialEndsAt } em cadastro novo (R9.6)', async () => {
    const trialEndsAt = new Date('2024-02-01T00:00:00.000Z');
    vi.mocked(signupService.signup).mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt,
      idempotentHit: false,
    });

    const res = await runEndpoint(mockRequest({ ip: '198.51.100.1' }));

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt,
    });
  });

  it('responde 200 em reenvio idempotente (R10.5)', async () => {
    vi.mocked(signupService.signup).mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt: new Date('2024-02-01T00:00:00.000Z'),
      idempotentHit: true,
    });

    const res = await runEndpoint(mockRequest({ ip: '198.51.100.2' }));

    expect(res.statusCode).toBe(200);
  });

  it('recusa com 429 pt-BR ao exceder o rate limit, sem chamar o serviço (R9.5)', async () => {
    vi.mocked(signupService.signup).mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'restaurante-teste',
      trialEndsAt: new Date('2024-02-01T00:00:00.000Z'),
      idempotentHit: false,
    });

    const ip = '198.51.100.10';

    // As primeiras SIGNUP_RATE_LIMIT_MAX requisições passam (200/201).
    for (let i = 0; i < SIGNUP_RATE_LIMIT_MAX; i += 1) {
      const res = await runEndpoint(mockRequest({ ip }));
      expect([200, 201]).toContain(res.statusCode);
    }

    const callsBeforeLimit = vi.mocked(signupService.signup).mock.calls.length;

    // A requisição seguinte, no mesmo IP, é recusada pelo limiter (429).
    const blocked = await runEndpoint(mockRequest({ ip }));

    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toEqual({
      statusCode: 429,
      error: 'TOO_MANY_REQUESTS',
      message: expect.stringMatching(/tentativas de cadastro/i),
    });
    // Sem efeito colateral: o rate limit precede o controller (R9.5).
    expect(vi.mocked(signupService.signup).mock.calls.length).toBe(callsBeforeLimit);
  });

  it('rejeita Content-Type não multipart com 422 pt-BR, sem chamar o serviço (R9.7)', async () => {
    const res = await runEndpoint(
      mockRequest({ ip: '198.51.100.20', contentType: 'application/json' }),
    );

    expect(res.statusCode).toBe(422);
    expect(res.body).toMatchObject({
      statusCode: 422,
      error: 'VALIDATION_ERROR',
      message: expect.stringMatching(/multipart\/form-data/i),
    });
    expect(signupService.signup).not.toHaveBeenCalled();
  });

  it('mapeia erro inesperado do serviço para 500 INTERNAL_ERROR sem vazar detalhes (R9.8)', async () => {
    vi.mocked(signupService.signup).mockRejectedValue(
      new Error('detalhe interno sensível: conexão com o banco recusada'),
    );

    const res = await runEndpoint(mockRequest({ ip: '198.51.100.30' }));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
    // O detalhe interno não pode aparecer no corpo devolvido ao cliente.
    expect(JSON.stringify(res.body)).not.toMatch(/detalhe interno sensível/);
  });
});
