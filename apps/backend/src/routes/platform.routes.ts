import { Router, type Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  platformAdminMiddleware,
  type PlatformAdminRequest,
} from '../middleware/platform-admin.middleware.js';
import { logPlatformAction } from '../services/platform-audit.service.js';
import { createTenant } from '../controllers/platform-tenant.controller.js';

/**
 * Platform-level router (`/api/platform/*`) for Platform_Admin operations
 * (tenant management).
 *
 * IMPORTANT: these routes use `authMiddleware` + `platformAdminMiddleware` and
 * DELIBERATELY DO NOT use `tenantMiddleware` — platform operations are not
 * scoped to a single tenant (Requirements 10.1, 10.2). Every route applies
 * `platformAdminMiddleware` so any Tenant_Admin / Tenant_User is rejected with
 * HTTP 403 (Requirement 10.4).
 *
 * Endpoints:
 *   - `GET  /api/platform/tenants`  — list tenants (scaffold).
 *   - `POST /api/platform/tenants`  — provision a new tenant via onboarding.
 *
 * Both record the platform audit trail (actor id + operation) per R10.7.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md`
 *   section "Papel de Platform_Admin vs Tenant_Admin" and section 7 (onboarding).
 */

const router = Router();

// All platform routes require a valid session AND a Platform_Admin.
router.use(authMiddleware, platformAdminMiddleware);

/**
 * GET /api/platform/tenants — list tenants (Platform_Admin only).
 *
 * Scaffold: returns an empty list for now; the real listing is implemented with
 * onboarding in a later task. It already records the audit trail for the
 * platform action (actor id + operation) per Requirement 10.7.
 */
router.get('/tenants', (req: PlatformAdminRequest, res: Response) => {
  const actorId = req.platformAdmin?.platformAdminId ?? req.user?.id ?? 'unknown';
  logPlatformAction(actorId, 'LIST_TENANTS');
  res.json({ tenants: [] });
});

/**
 * POST /api/platform/tenants — provision a new tenant (R9.1, R9.5, R10.2).
 *
 * Delegates to `provisionTenant` (validation, idempotency, full rollback) and
 * records the audit trail. See `platform-tenant.controller.ts`.
 */
router.post('/tenants', createTenant);

export default router;
