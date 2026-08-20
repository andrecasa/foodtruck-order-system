import { Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest as BaseAuthenticatedRequest } from './auth.middleware.js';

/**
 * Platform admin authorization middleware (Platform_Admin role).
 *
 * Runs AFTER `authMiddleware`, on the `/api/platform/*` routes, and INSTEAD of
 * the `tenantMiddleware`: platform routes manage tenants and therefore are NOT
 * scoped to a single tenant (Requirement 10.2).
 *
 * It resolves whether the authenticated user is a Platform_Admin by looking up
 * the `platform_admins` table (keyed by the Supabase Auth user id). A
 * Tenant_Admin / Tenant_User (i.e. any user not present in `platform_admins`)
 * requesting a tenant-management operation is rejected with HTTP 403 and the
 * operation is not executed (Requirements 10.1, 10.4).
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md`
 *   section "Papel de Platform_Admin vs Tenant_Admin".
 * Requirements: 10.1, 10.2, 10.4.
 */

/**
 * Resolved platform-admin context attached to the request once authorization
 * succeeds. Distinct from `TenantContext`: a Platform_Admin does not belong to
 * a single tenant (Requirement 10.1).
 */
export interface PlatformAdminContext {
  platformAdminId: string;
  email: string;
}

/**
 * Augmented request carrying the authenticated user plus the resolved
 * platform-admin context. Extends the base `AuthenticatedRequest` so the `user`
 * shape stays consistent across the middleware chain.
 */
export interface PlatformAdminRequest extends BaseAuthenticatedRequest {
  platformAdmin?: PlatformAdminContext;
}

interface PlatformAdminRow {
  id: string;
  email: string;
}

export async function platformAdminMiddleware(
  req: PlatformAdminRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;

  // Without an authenticated user there is nothing to authorize. This should
  // normally be caught upstream by `authMiddleware`, but we guard defensively.
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
      'SELECT id, email FROM platform_admins WHERE id = $1',
      [user.id],
    );

    const row = result.rows[0] as PlatformAdminRow | undefined;

    // The user is not a Platform_Admin (a Tenant_Admin or Tenant_User): reject
    // tenant-management operations with 403 and do not execute them
    // (Requirements 10.4, 10.1).
    if (!row) {
      res.status(403).json({
        statusCode: 403,
        error: 'FORBIDDEN',
        message: 'Acesso restrito a administradores da plataforma.',
      });
      return;
    }

    // Success: expose the platform-admin context to downstream layers.
    req.platformAdmin = {
      platformAdminId: row.id,
      email: row.email,
    };

    next();
  } catch (err) {
    console.error('[platform-admin-middleware] Error resolving platform admin:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro interno ao verificar permissões de plataforma.',
    });
  }
}
