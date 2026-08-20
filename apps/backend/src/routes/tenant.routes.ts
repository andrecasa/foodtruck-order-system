import { Router } from 'express';
import { getBranding } from '../controllers/branding.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

/**
 * Tenant-scoped routes (mounted under `/api/tenant`).
 *
 * Every route runs behind the full resolution chain: auth → syncUser → tenant,
 * so `req.tenantId` is available to the controllers.
 */
const router = Router();

// GET /api/tenant/branding - Authenticated tenant branding (R7.1, R7.6, R7.7, R11.3)
router.get('/branding', authMiddleware, syncUserMiddleware, tenantMiddleware, getBranding);

export default router;
