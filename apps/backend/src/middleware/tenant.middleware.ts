import { type Response, type NextFunction } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest as BaseAuthenticatedRequest } from './auth.middleware.js';
import { isTrialBlocked, TRIAL_EXPIRED } from '../services/trial-guard.js';

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
  trial_ends_at: string | null;
  subscription_status: string | null;
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
      `SELECT u.tenant_id, t.status, t.timezone,
              t.trial_ends_at, t.subscription_status
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

    // Trial_Guard: um tenant em teste permanece `status = 'ativo'` (R12.6), então
    // o bloqueio por teste expirado é aplicado APÓS a checagem de `status`. Nega
    // toda requisição autenticada ao painel/app quando o teste expirou e o tenant
    // não converteu (R12.2/R12.3), preservando o comportamento para trial vigente,
    // tenant convertido ou legado sem `trial_ends_at` (R12.4).
    if (
      isTrialBlocked({
        trialEndsAt: row.trial_ends_at,
        subscriptionStatus: row.subscription_status,
        now: new Date(),
      })
    ) {
      res.status(TRIAL_EXPIRED.statusCode).json({
        statusCode: TRIAL_EXPIRED.statusCode,
        error: TRIAL_EXPIRED.code,
        message: TRIAL_EXPIRED.message,
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
