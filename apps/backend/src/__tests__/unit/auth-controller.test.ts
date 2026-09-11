import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Request, type Response } from 'express';

/**
 * Testes unitários do `auth.controller.login` com foco no Trial_Guard (R12.1).
 *
 * O login é público e roda ANTES do `tenantMiddleware`, então o controller
 * resolve o tenant do usuário (via `findTenantTrialByUserId`) e aplica o
 * predicado puro `isTrialBlocked` antes de emitir a sessão. Um tenant com teste
 * expirado e não convertido tem o login negado com 403 `TRIAL_EXPIRED`; trial
 * vigente, tenant convertido ou legado sem `trial_ends_at` seguem normalmente.
 *
 * **Validates: Requirements 12.1, 12.4**
 */

// O login usa Supabase via authService; mockamos o serviço inteiro para não
// tocar em rede, preservando a `ServiceError` real (usada pelo controller).
vi.mock('../../services/auth.service.js', async () => {
  const { ServiceError } = await import('../../services/service-error.js');
  return {
    ServiceError,
    login: vi.fn(),
  };
});

// Efeitos de rate-limit e IP: neutralizados (não são o foco destes testes).
vi.mock('../../middleware/rate-limit.middleware.js', () => ({
  recordFailedAttempt: vi.fn(),
  resetRateLimit: vi.fn(),
}));

vi.mock('../../http/client-ip.js', () => ({
  getClientIp: () => '127.0.0.1',
}));

// Repositório de usuário: controlamos papel e dados de trial do tenant.
vi.mock('../../db/user-repository.js', () => ({
  findUserRoleById: vi.fn(),
  findTenantTrialByUserId: vi.fn(),
}));

import * as authService from '../../services/auth.service.js';
import { findUserRoleById, findTenantTrialByUserId } from '../../db/user-repository.js';
import { login } from '../../controllers/auth.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

const LOGIN_RESULT = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresIn: 3600,
  user: { id: 'user-1', email: 'a@b.com' },
};

function mockRequest(): Partial<Request> {
  return { body: { email: 'a@b.com', password: 'secret123' }, headers: {} };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('auth.controller.login — Trial_Guard (R12.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authService.login).mockResolvedValue(LOGIN_RESULT as never);
    vi.mocked(findUserRoleById).mockResolvedValue('admin');
  });

  it('nega o login com 403 TRIAL_EXPIRED quando o teste expirou e o tenant não converteu (R12.1)', async () => {
    vi.mocked(findTenantTrialByUserId).mockResolvedValue({
      trialEndsAt: new Date(Date.now() - 60_000).toISOString(),
      subscriptionStatus: 'trial',
    });

    const res = mockResponse();
    await invokeHandler(login as never, mockRequest(), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('TRIAL_EXPIRED');
    // A sessão não deve vazar quando o login é negado por trial.
    expect(res.body.accessToken).toBeUndefined();
  });

  it('permite o login quando o trial ainda está vigente (R12.4)', async () => {
    vi.mocked(findTenantTrialByUserId).mockResolvedValue({
      trialEndsAt: new Date(Date.now() + 60_000).toISOString(),
      subscriptionStatus: 'trial',
    });

    const res = mockResponse();
    await invokeHandler(login as never, mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBe('access');
    expect(res.body.user.role).toBe('admin');
  });

  it('permite o login de tenant convertido mesmo com o teste expirado (R12.4)', async () => {
    vi.mocked(findTenantTrialByUserId).mockResolvedValue({
      trialEndsAt: new Date(Date.now() - 60_000).toISOString(),
      subscriptionStatus: 'active',
    });

    const res = mockResponse();
    await invokeHandler(login as never, mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBe('access');
  });

  it('permite o login de tenant legado sem trial_ends_at (R12.4)', async () => {
    vi.mocked(findTenantTrialByUserId).mockResolvedValue({
      trialEndsAt: null,
      subscriptionStatus: 'trial',
    });

    const res = mockResponse();
    await invokeHandler(login as never, mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBe('access');
  });

  it('permite o login quando o usuário não resolve para um tenant (R12.4)', async () => {
    vi.mocked(findTenantTrialByUserId).mockResolvedValue(null);

    const res = mockResponse();
    await invokeHandler(login as never, mockRequest(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.accessToken).toBe('access');
  });
});
