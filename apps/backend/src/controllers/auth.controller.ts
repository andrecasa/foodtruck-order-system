import { Request, Response } from 'express';
import { SESSION_DURATION_HOURS } from '@order-system/shared';
import { supabase } from '../config/supabase.js';
import {
  recordFailedAttempt,
  resetRateLimit,
} from '../middleware/rate-limit.middleware.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

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
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      recordFailedAttempt(ip);
      res.status(401).json({
        statusCode: 401,
        error: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha incorretos',
      });
      return;
    }

    // Reset rate limit on successful login
    resetRateLimit(ip);

    res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: SESSION_DURATION_HOURS * 3600,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch {
    recordFailedAttempt(ip);
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
    const { error } = await supabase.auth.signOut();

    if (error) {
      res.status(500).json({
        statusCode: 500,
        error: 'LOGOUT_FAILED',
        message: 'Falha ao encerrar sessão.',
      });
      return;
    }

    res.status(200).json({ message: 'Sessão encerrada com sucesso.' });
  } catch {
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
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({
      statusCode: 400,
      error: 'BAD_REQUEST',
      message: 'Refresh token é obrigatório.',
    });
    return;
  }

  try {
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      res.status(401).json({
        statusCode: 401,
        error: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token inválido ou expirado.',
      });
      return;
    }

    res.status(200).json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: SESSION_DURATION_HOURS * 3600,
    });
  } catch {
    res.status(401).json({
      statusCode: 401,
      error: 'INVALID_REFRESH_TOKEN',
      message: 'Refresh token inválido ou expirado.',
    });
  }
}
