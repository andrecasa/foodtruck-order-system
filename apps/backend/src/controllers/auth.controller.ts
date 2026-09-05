import { Request, Response } from 'express';
import {
  recordFailedAttempt,
  resetRateLimit,
} from '../middleware/rate-limit.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import { getClientIp } from '../http/client-ip.js';

// O mapeamento HTTP de erros é feito centralmente pelo errorHandler
// (src/http/error-handler.js): estes handlers lançam ServiceError e as rotas os
// envolvem em asyncHandler. Os fallbacks antigos (INVALID_CREDENTIALS,
// LOGOUT_FAILED, INVALID_REFRESH_TOKEN) eram redundantes — o authService já
// lança ServiceError com exatamente esses statusCode/code/message.

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new authService.ServiceError(
      'E-mail e senha são obrigatórios.',
      400,
      'BAD_REQUEST',
    );
  }

  const ip = getClientIp(req);

  // Efeito colateral do rate limit: registra a tentativa falha e re-lança para
  // o errorHandler mapear. É o ÚNICO try/catch mantido aqui, e existe apenas
  // por causa do efeito de rate limit — não faz mapeamento HTTP.
  let result: authService.LoginResult;
  try {
    result = await authService.login({ email, password });
  } catch (err) {
    recordFailedAttempt(ip);
    throw err;
  }

  resetRateLimit(ip);
  res.status(200).json(result);
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new authService.ServiceError(
      'Token de autenticação não fornecido.',
      401,
      'UNAUTHORIZED',
    );
  }

  await authService.logout();
  res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
}

export async function getSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  // authMiddleware already verified the token and set req.user
  if (!req.user) {
    throw new authService.ServiceError('Sessão inválida.', 401, 'UNAUTHORIZED');
  }

  res.status(200).json({
    user: req.user,
  });
}

/**
 * POST /api/auth/refresh — Renew access token using a refresh token.
 * No auth middleware required (the access token may already be expired).
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new authService.ServiceError(
      'Refresh token é obrigatório.',
      400,
      'BAD_REQUEST',
    );
  }

  const result = await authService.refreshToken(token);
  res.status(200).json(result);
}
