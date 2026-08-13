import { Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

export async function syncUserMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;
  if (!user || !user.id) {
    next();
    return;
  }

  try {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [user.id]);

    if (existing.rows.length === 0) {
      // Determine role: first user becomes admin
      const adminCheck = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
      );
      const role = adminCheck.rows.length === 0 ? 'admin' : 'atendente';

      // Derive default name from email prefix
      const name = user.email.split('@')[0] || 'user';

      // Insert with ON CONFLICT to handle race conditions
      await pool.query(
        `INSERT INTO users (id, email, name, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ativo', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, name, role],
      );
    }

    next();
  } catch (err) {
    console.error('[sync-user-middleware] Error syncing user:', err);
    // Don't block the request — let downstream middlewares handle auth
    next();
  }
}
