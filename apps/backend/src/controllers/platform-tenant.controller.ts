import { Response } from 'express';
import type { PlatformAdminRequest } from '../middleware/platform-admin.middleware.js';
import {
  provisionTenant,
  ProvisioningValidationError,
  ProvisioningError,
  type ProvisionTenantInput,
} from '../services/tenant-provision.service.js';
import { logPlatformAction } from '../services/platform-audit.service.js';

/**
 * POST /api/platform/tenants — provision a new tenant (Platform_Admin only).
 *
 * Platform-level onboarding endpoint. Sits behind `authMiddleware` +
 * `platformAdminMiddleware` and DELIBERATELY NOT `tenantMiddleware` — creating a
 * tenant is not scoped to an existing tenant (Requirements 10.1, 10.2).
 *
 * Flow:
 *   1. delegate to `provisionTenant` (transactional; validates, is idempotent by
 *      `provisioning_key`, and rolls back fully on failure — R9.1, R9.5, R9.7–R9.9);
 *   2. map `ProvisioningValidationError` → 422 with the invalid field list (R9.8);
 *   3. return 201 with the created tenant id on success, or 200 on an idempotent
 *      hit (re-sent `provisioning_key`, R9.9);
 *   4. record the platform audit trail (actor id + operation) either way (R10.7).
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 7.
 * Requirements: 9.1, 9.5, 10.2, 10.7.
 */
export async function createTenant(
  req: PlatformAdminRequest,
  res: Response,
): Promise<void> {
  const actorId = req.platformAdmin?.platformAdminId ?? req.user?.id ?? 'unknown';

  try {
    const result = await provisionTenant(req.body as ProvisionTenantInput);

    // Audit the platform action with the actor id + operation + target tenant (R10.7).
    logPlatformAction(actorId, 'CREATE_TENANT', {
      tenantId: result.tenantId,
      idempotentHit: result.idempotentHit,
    });

    // An idempotent hit means the tenant already existed for this
    // provisioning_key — nothing new was created, so respond 200 (R9.9).
    res.status(result.idempotentHit ? 200 : 201).json({
      tenantId: result.tenantId,
      adminUserId: result.adminUserId,
      businessName: result.businessName,
      status: result.status,
      idempotentHit: result.idempotentHit,
    });
  } catch (err) {
    if (err instanceof ProvisioningValidationError) {
      // Invalid/incomplete input — rejected before any write (R9.8).
      logPlatformAction(actorId, 'CREATE_TENANT_REJECTED', { fields: err.fields });
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: err.message,
        fields: err.fields,
      });
      return;
    }

    if (err instanceof ProvisioningError) {
      // A provisioning step failed; the service already rolled everything back (R9.7).
      logPlatformAction(actorId, 'CREATE_TENANT_FAILED', {
        message: err.message,
      });
      res.status(500).json({
        statusCode: 500,
        error: 'PROVISIONING_FAILED',
        message: err.message,
      });
      return;
    }

    console.error('[platform-tenant-controller] Unexpected error provisioning tenant:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao provisionar o tenant.',
    });
  }
}
