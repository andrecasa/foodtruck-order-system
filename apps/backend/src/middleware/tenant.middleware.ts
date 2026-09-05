import { type Response, type NextFunction } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest as BaseAuthenticatedRequest } from './auth.middleware.js';

/**
 * Tenant resolution middleware (Tenant_Resolution_Middleware).
 *
 * Runs AFTER `authMiddleware` and `syncUserMiddleware`, before the business
 * controllers. It resolves the request's tenant from the authenticated user's
 * row and exposes it to the rest of the request via `req.tenantId` /
 * `req.tenantContext`.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 2.
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7.
 */

/**
 * Resolved tenant context attached to the request once resolution succeeds
 * (Requirement 4.3). Accessible to all subsequent layers.
 */
export interface TenantContext {
  tenantId: string;
  timezone: string;
  status: 'ativo' | 'inativo';
}

/**
 * Augmented request carrying the authenticated user plus the resolved tenant.
 * Extends the base `AuthenticatedRequest` from `auth.middleware.ts` so the
 * `user` shape stays consistent across the middleware chain.
 */
export interface AuthenticatedRequest extends BaseAuthenticatedRequest {
  tenantId?: string;
  tenantContext?: TenantContext;
}

interface TenantResolutionRow {
  tenant_id: string | null;
  status: 'ativo' | 'inativo' | null;
  timezone: string | null;
}

export async function tenantMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;

  // The tenant is resolved from the authenticated user's credentials. Without a
  // user id there is nothing to resolve → tenant cannot be determined (R4.7).
  if (!user || !user.id) {
    res.status(401).json({
      statusCode: 401,
      error: 'TENANT_RESOLUTION_FAILED',
      message: 'Não foi possível determinar o tenant a partir das credenciais.',
    });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT u.tenant_id, t.status, t.timezone
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = $1`,
      [user.id],
    );

    const row = result.rows[0] as TenantResolutionRow | undefined;

    // No row (user not found, or user has a null tenant_id so the JOIN yields
    // nothing): the tenant_id cannot be determined from the credentials → 401
    // (R4.7).
    if (!row || !row.tenant_id) {
      res.status(401).json({
        statusCode: 401,
        error: 'TENANT_RESOLUTION_FAILED',
        message: 'Não foi possível determinar o tenant a partir das credenciais.',
      });
      return;
    }

    // The user resolves to a tenant, but the tenant association is not valid
    // (e.g. tenant row missing status/timezone) → no valid associated tenant
    // (R4.4).
    if (!row.status || !row.timezone) {
      res.status(403).json({
        statusCode: 403,
        error: 'NO_TENANT_ASSOCIATED',
        message: 'Usuário não possui um tenant associado válido.',
      });
      return;
    }

    // Tenant exists but is not active → reject (R4.5).
    if (row.status !== 'ativo') {
      res.status(403).json({
        statusCode: 403,
        error: 'TENANT_INACTIVE',
        message: 'O tenant está inativo.',
      });
      return;
    }

    // Success: expose the resolved tenant to downstream layers (R4.3, R4.6).
    req.tenantId = row.tenant_id;
    req.tenantContext = {
      tenantId: row.tenant_id,
      timezone: row.timezone,
      status: row.status,
    };

    next();
  } catch (err) {
    console.error('[tenant-middleware] Error resolving tenant:', err);
    res.status(401).json({
      statusCode: 401,
      error: 'TENANT_RESOLUTION_FAILED',
      message: 'Falha na resolução do tenant.',
    });
  }
}
