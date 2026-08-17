import { Request, Response } from 'express';
import {
  recordFailedAttempt,
  resetRateLimit,
} from '../middleware/rate-limit.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      statusCode: 400,
      error: 'BAD_REQUEST',
      message: 'E-mail e senha são obrigatórios.',
    });
    return;
  }

  const ip = getClientIp(req);

  try {
    const result = await authService.login({ email, password });
    resetRateLimit(ip);
    res.status(200).json(result);
  } catch (err) {
    recordFailedAttempt(ip);
    if (err instanceof authService.ServiceError) {
      res.status(err.statusCode).json({
        statusCode: err.statusCode,
        error: err.code,
        message: err.message,
      });
      return;
    }
    res.status(401).json({
      statusCode: 401,
      error: 'INVALID_CREDENTIALS',
      message: 'E-mail ou senha incorretos',
    });
  }
}

export async function logout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Token de autenticação não fornecido.',
    });
    return;
  }

  try {
    await authService.logout();
    res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
  } catch (err) {
    if (err instanceof authService.ServiceError) {
      res.status(err.statusCode).json({
        statusCode: err.statusCode,
        error: err.code,
        message: err.message,
      });
      return;
    }
    res.status(500).json({
      statusCode: 500,
      error: 'LOGOUT_FAILED',
      message: 'Falha ao encerrar sessão.',
    });
  }
}

export async function getSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  // authMiddleware already verified the token and set req.user
  if (!req.user) {
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Sessão inválida.',
    });
    return;
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
    res.status(400).json({
      statusCode: 400,
      error: 'BAD_REQUEST',
      message: 'Refresh token é obrigatório.',
    });
    return;
  }

  try {
    const result = await authService.refreshToken(token);
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof authService.ServiceError) {
      res.status(err.statusCode).json({
        statusCode: err.statusCode,
        error: err.code,
        message: err.message,
      });
      return;
    }
    res.status(401).json({
      statusCode: 401,
      error: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token inválido ou expirado.',
    });
  }
}
