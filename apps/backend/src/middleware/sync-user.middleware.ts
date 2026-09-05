import { type Response, type NextFunction } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

/**
 * User synchronization middleware.
 *
 * Runs AFTER `authMiddleware` and BEFORE `tenantMiddleware`. Its job is to make
 * sure the authenticated Supabase user has a consistent row in the local
 * `users` table so that `tenantMiddleware` can resolve the tenant from it.
 *
 * ## Multi-tenant behavior and assumptions
 *
 * In the multi-tenant model, `users.tenant_id` is `NOT NULL` and every user
 * belongs to exactly one tenant (Requirement 4.1). A user's tenant is
 * established when the user is provisioned — the onboarding flow (spec task 19)
 * inserts the first admin (and any subsequent users) already carrying a
 * `tenant_id`. The "first user of a tenant becomes that tenant's admin" rule is
 * therefore a property of onboarding/user creation, scoped per tenant — NOT a
 * global "first user in the whole platform becomes admin" rule.
 *
 * Because this middleware runs before the tenant is resolved and the request
 * carries no tenant hint (the Supabase JWT only yields `id`/`email`), it CANNOT
 * safely synthesize a `tenant_id` for a brand-new user. Inserting a row without
 * a tenant would violate the `NOT NULL` constraint and, worse, would guess an
 * association that only onboarding can authoritatively make.
 *
 * Consequently this middleware:
 *   - If the user already has a row (created by onboarding/user management),
 *     leaves it untouched — the row is already tenant-consistent — and passes
 *     control on. `tenantMiddleware` then resolves the tenant from it.
 *   - If the user has NO row, it does NOT create one. It simply calls `next()`
 *     and lets `tenantMiddleware` reject the request (401 — tenant not
 *     determinable from the credentials, Requirement 4.7). This keeps the
 *     middleware chain working without ever creating an orphan/untenanted user.
 *
 * Note: the global first-admin bootstrap that existed in the single-tenant MVP
 * has been intentionally removed. Provisioning the first admin per tenant now
 * belongs to `provisionTenant()` (spec task 19).
 */
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
    // Verify the user already has a tenant-consistent row. We do NOT create a
    // row here because the tenant cannot be determined at this point in the
    // chain — user rows are provisioned (with their tenant_id) by onboarding.
    const existing = await pool.query(
      'SELECT id, tenant_id FROM users WHERE id = $1',
      [user.id],
    );

    if (existing.rows.length === 0) {
      // Unknown user: no tenant association exists yet. Let tenantMiddleware
      // handle the rejection (401). Creating a row here would require guessing
      // a tenant and would violate the NOT NULL tenant_id invariant.
      console.warn(
        `[sync-user-middleware] Authenticated user ${user.id} has no provisioned row; ` +
          'tenant cannot be resolved. Deferring to tenantMiddleware.',
      );
    }

    next();
  } catch (err) {
    console.error('[sync-user-middleware] Error syncing user:', err);
    // Don't block the request — let downstream middlewares handle resolution.
    next();
  }
}
