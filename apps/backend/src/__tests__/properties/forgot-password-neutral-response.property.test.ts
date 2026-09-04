import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import * as fc from 'fast-check';

// O serviço de recuperação (`password-reset.service`) importa
// `config/supabase.js` e `config/database.js`, que exigem credenciais/pool reais
// no carregamento. Mockamos ambos apenas para permitir o import da cadeia de
// módulos durante o teste do controller.
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn(), signOut: vi.fn() } } },
}));
vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// O controller chama `passwordResetService.requestCode` diretamente (não
// injetado). Mockamos o módulo do serviço para simular cada cenário de negócio
// (ativo, inativo/inexistente, rate-limited e falha de e-mail) apenas variando o
// comportamento de `requestCode`. `ServiceError` é preservado para não quebrar o
// mapeamento de erros no controller.
vi.mock('../../services/password-reset.service.js', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly code: string,
    ) {
      super(message);
      this.name = 'ServiceError';
    }
  },
  requestCode: vi.fn(),
  confirmReset: vi.fn(),
}));

import { forgotPassword, NEUTRAL_MESSAGE } from '../../controllers/password-reset.controller.js';
import * as passwordResetService from '../../services/password-reset.service.js';

const mockRequestCode = passwordResetService.requestCode as ReturnType<typeof vi.fn>;

/**
 * Feature: forgot-password, Property 1: Resposta de solicitação indistinguível (não enumeração)
 *
 * Para qualquer e-mail em formato válido, a resposta do endpoint de solicitação
 * de código deve ter conteúdo, formato e código de status idênticos,
 * independentemente de o e-mail corresponder a um usuário ativo, inativo,
 * inexistente, ou de a solicitação ter sido recusada por rate limit ou de o
 * envio de e-mail ter falhado.
 *
 * Estratégia: o controller `forgotPassword` chama `requestCode` do serviço. Cada
 * cenário de negócio é simulado apenas variando o comportamento do mock de
 * `requestCode`:
 *  - usuário ativo   → `requestCode` resolve (código gerado/enviado);
 *  - inativo/inexistente → `requestCode` resolve void (nada persistido);
 *  - rate-limited    → `requestCode` resolve void (recusa silenciosa neutra);
 *  - falha de e-mail / erro interno → `requestCode` rejeita (throws).
 * Em todos os casos, a resposta observável deve ser IDÊNTICA: status 200 e corpo
 * `{ message: NEUTRAL_MESSAGE }`.
 *
 * **Validates: Requirements 2.2, 2.5, 2.6, 4.4, 9.3, 9.5**
 */

// Gera um e-mail em formato válido (formato inválido é coberto pela Property 2).
const validEmail = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.stringMatching(/^[a-z0-9]{1,15}$/),
    fc.constantFrom('com', 'com.br', 'net', 'org', 'io'),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
  .filter((email) => email.length <= 254);

/**
 * Cenários de negócio possíveis para uma solicitação de código com e-mail válido.
 * Cada um define como o mock de `requestCode` se comporta. A resposta do
 * controller deve ser indistinguível entre todos eles.
 */
type Scenario = 'active' | 'inactive' | 'nonexistent' | 'rate-limited' | 'email-failure';

const scenarioArb = fc.constantFrom<Scenario>(
  'active',
  'inactive',
  'nonexistent',
  'rate-limited',
  'email-failure',
);

/** Aplica o comportamento do mock de `requestCode` conforme o cenário. */
function applyScenario(scenario: Scenario): void {
  switch (scenario) {
    case 'active':
      // Usuário ativo: código gerado/enviado com sucesso → resolve void.
      mockRequestCode.mockResolvedValueOnce(undefined);
      break;
    case 'inactive':
    case 'nonexistent':
    case 'rate-limited':
      // Sem usuário ativo ou recusa por rate limit: nada é persistido e o
      // serviço nunca lança → resolve void.
      mockRequestCode.mockResolvedValueOnce(undefined);
      break;
    case 'email-failure':
      // Falha no envio/erro interno: o serviço rejeita. O controller captura e
      // mantém a resposta neutra.
      mockRequestCode.mockRejectedValueOnce(new Error('falha de e-mail'));
      break;
  }
}

function mockRequest(email: string): Request {
  return { body: { email } } as Request;
}

function mockResponse(): Response & { statusCode: number; body: unknown } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('Feature: forgot-password, Property 1: Resposta de solicitação indistinguível (não enumeração)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Silencia o log de diagnóstico do controller no cenário de falha.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('produz resposta idêntica (status 200 + Mensagem_Neutra) em qualquer cenário', async () => {
    await fc.assert(
      fc.asyncProperty(validEmail, scenarioArb, async (email, scenario) => {
        applyScenario(scenario);

        const req = mockRequest(email);
        const res = mockResponse();

        await forgotPassword(req, res);

        // Property: status e corpo são idênticos e neutros em todos os cenários.
        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual({ message: NEUTRAL_MESSAGE });
      }),
      { numRuns: 100 },
    );
  });

  it('a resposta é indistinguível entre os cinco cenários para o mesmo e-mail', async () => {
    const allScenarios: Scenario[] = [
      'active',
      'inactive',
      'nonexistent',
      'rate-limited',
      'email-failure',
    ];

    await fc.assert(
      fc.asyncProperty(validEmail, async (email) => {
        const responses: Array<{ statusCode: number; body: unknown }> = [];

        for (const scenario of allScenarios) {
          mockRequestCode.mockReset();
          applyScenario(scenario);

          const res = mockResponse();
          await forgotPassword(mockRequest(email), res);

          responses.push({ statusCode: res.statusCode, body: res.body });
        }

        // Property: todas as respostas coletadas são idênticas entre si.
        const first = responses[0];
        for (const response of responses) {
          expect(response.statusCode).toBe(first.statusCode);
          expect(response.body).toEqual(first.body);
        }
        // E o valor comum é a resposta neutra esperada.
        expect(first.statusCode).toBe(200);
        expect(first.body).toEqual({ message: NEUTRAL_MESSAGE });
      }),
      { numRuns: 100 },
    );
  });
});
