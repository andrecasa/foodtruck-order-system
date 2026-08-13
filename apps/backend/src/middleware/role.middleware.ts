import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database.js';

export interface AuthenticatedUserWithRole {
  id: string;
  email: string;
  role: 'admin' | 'atendente' | 'preparador';
}

export interface AdminRequest extends Request {
  user?: AuthenticatedUserWithRole;
}

/**
 * Middleware que verifica a role do usuário no banco de dados.
 * - Consulta a tabela users pelo id do token.
 * - Se usuário não existir no banco: 401 (sessão inválida).
 * - Se usuário inativo: 403 (desativado).
 * - Se role != 'admin': 403 (acesso restrito).
 * - Enriquece req.user com role.
 */
export async function adminMiddleware(
  req: AdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;

  if (!user || !user.id) {
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Sessão inválida. Faça login novamente.',
    });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT role, status FROM users WHERE id = $1',
      [user.id],
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'Sessão inválida. Faça login novamente.',
      });
      return;
    }

    const dbUser = result.rows[0];

    if (dbUser.status === 'inativo') {
      res.status(403).json({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Usuário desativado. Contate o administrador.',
      });
      return;
    }

    if (dbUser.role !== 'admin') {
      res.status(403).json({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Acesso restrito a administradores.',
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: dbUser.role,
    };

    next();
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro interno ao verificar permissões.',
    });
  }
}
