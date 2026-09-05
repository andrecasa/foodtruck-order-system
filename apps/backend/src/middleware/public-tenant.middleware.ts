import { type Request, type Response, type NextFunction } from 'express';
import { pool } from '../config/database.js';

/**
 * Public tenant resolution middleware (customer-ordering R1–R5).
 *
 * Resolves the tenant for the unauthenticated public routes mounted under
 * `/api/public/:slug/`. Unlike `tenant.middleware.ts` (which resolves the
 * tenant from the authenticated user), this middleware resolves the tenant
 * directly from the URL `:slug`, which maps to `tenants.provisioning_key`.
 *
 * Because tenant resolution is a platform-level concern (there is no tenant in
 * scope yet), it consumes the shared `pool` directly rather than going through
 * `tenantRepository(tenantId)`.
 *
 * Flow:
 *   1. Validate the slug format with a regex BEFORE touching the DB. An invalid
 *      format short-circuits with 400 `INVALID_SLUG_FORMAT` (R1.4, R4/R5 404
 *      only applies to well-formed-but-missing slugs).
 *   2. Look up an active tenant by `provisioning_key`. A missing/inactive tenant
 *      yields 404 `TENANT_NOT_FOUND`.
 *   3. On success, attach `req.tenantId` / `req.tenantSlug` and call `next()`.
 *
 * Design: `.kiro/specs/customer-ordering/design.md`
 *   → "Middleware de resolução por slug".
 */

/**
 * URL-friendly slug format: 3–60 chars, lowercase letters/digits/hyphens, and
 * must neither start nor end with a hyphen. Mirrors the onboarding validation
 * in `tenant-provision.service.ts` (`SLUG_FORMAT`) so both ends agree on what a
 * valid public slug looks like.
 */
const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

/**
 * Augmented request carrying the tenant resolved from the public `:slug`.
 * Exposed to the downstream public controllers.
 */
export interface PublicTenantRequest extends Request {
  tenantId?: string;
  tenantSlug?: string;
}

interface PublicTenantRow {
  id: string;
}

export async function publicTenantMiddleware(
  req: PublicTenantRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const slug = req.params.slug;

  // 1. Reject malformed slugs BEFORE hitting the DB (R1.4). This avoids a
  //    pointless query and keeps injection-shaped input off the connection.
  //    `req.params` values are typed loosely (string | string[]); anything that
  //    is not a plain string is treated as an invalid format.
  if (typeof slug !== 'string' || !SLUG_FORMAT.test(slug)) {
    res.status(400).json({ error: 'INVALID_SLUG_FORMAT' });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT id FROM tenants WHERE provisioning_key = $1 AND status = 'ativo'`,
      [slug],
    );

    const row = result.rows[0] as PublicTenantRow | undefined;

    // 2. No active tenant for this slug → 404 with a friendly message (R1.4,
    //    R2.3, R4.4, R5.4).
    if (!row) {
      res.status(404).json({
        error: 'TENANT_NOT_FOUND',
        message: 'Estabelecimento não encontrado.',
      });
      return;
    }

    // 3. Success: expose the resolved tenant to the public controllers.
    req.tenantId = row.id;
    req.tenantSlug = slug;

    next();
  } catch (err) {
    console.error('[public-tenant-middleware] Error resolving tenant:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
}
