import { type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/tenant.middleware.js';
import * as brandingService from '../services/branding.service.js';
import { logError } from '../http/log-error.js';

/**
 * GET /api/tenant/branding
 *
 * Returns the authenticated tenant's branding (businessName, logoUrl, theme).
 * The theme is the tenant's partial override merged over the neutral platform
 * theme. Sits behind auth → syncUser → tenant middlewares, so `req.tenantId` is
 * guaranteed once we reach here.
 *
 * Requirements: 7.1, 7.6, 7.7 (≤ 2s), 11.3.
 */
export async function getBranding(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = req.tenantId;

  // Defensive: the tenantMiddleware guarantees this, but guard so the service's
  // MissingTenantContextError never surfaces as an opaque 500 here.
  if (!tenantId) {
    res.status(401).json({
      statusCode: 401,
      error: 'TENANT_RESOLUTION_FAILED',
      message: 'Não foi possível determinar o tenant a partir das credenciais.',
    });
    return;
  }

  try {
    const branding = await brandingService.getBranding(tenantId);
    res.status(200).json(branding);
  } catch (err) {
    if (err instanceof brandingService.BrandingNotFoundError) {
      res.status(404).json({
        statusCode: 404,
        error: 'BRANDING_NOT_FOUND',
        message: 'Branding do tenant não encontrado.',
      });
      return;
    }

    logError('branding', err, req);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao obter o branding do tenant.',
    });
  }
}
