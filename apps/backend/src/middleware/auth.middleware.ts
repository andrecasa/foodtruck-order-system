import { type Request, type Response, type NextFunction } from 'express';
import { supabase } from '../config/supabase.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Token de autenticação não fornecido.',
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Token inválido ou expirado.',
      });
      return;
    }

    req.user = {
      id: data.user.id,
      email: data.user.email || '',
    };

    next();
  } catch {
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Falha na verificação do token.',
    });
  }
}
