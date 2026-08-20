import type { TenantBrandingResponse, ThemeConfig } from '@order-system/shared';
import { tenantRepository } from '../db/tenant-repository.js';
import { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '../theme/platform-theme.js';

/**
 * Branding & Theme Service (Branding_Service).
 *
 * Exposes the authenticated tenant's branding (businessName, logo, theme) so the
 * front-end Theme_Provider can apply it at runtime after login.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 5.
 * Requirements: 7.1, 7.6, 7.7, 11.3.
 *
 * Data access goes exclusively through the centralized `tenantRepository`
 * helper (never the raw pool), so this service stays behind the tenant
 * isolation boundary (R5.6). The tenant's own row lives in `tenants` keyed by
 * `id`, so we read it via the repository `raw()` escape hatch with the resolved
 * `tenantId` as the mandatory `$1` placeholder.
 */

export class BrandingNotFoundError extends Error {
  constructor(message = 'Tenant não encontrado para branding.') {
    super(message);
    this.name = 'BrandingNotFoundError';
  }
}

interface TenantBrandingRow {
  business_name: string;
  logo_url: string | null;
  theme: Partial<ThemeConfig> | null;
}

/**
 * Returns the branding for the given tenant: businessName, logoUrl and the
 * theme resolved as the tenant's partial `theme` override merged on top of the
 * neutral platform theme (R11.3, R11.5). Values are sourced from the `tenants`
 * table — never hardcoded (R7.6).
 *
 * @param tenantId The resolved tenant id (from `tenantMiddleware`, `req.tenantId`).
 * @throws MissingTenantContextError if `tenantId` is missing (from the repository).
 * @throws BrandingNotFoundError if no tenant row exists for `tenantId`.
 */
export async function getBranding(tenantId: string): Promise<TenantBrandingResponse> {
  const repo = tenantRepository(tenantId);

  // `$1` is the resolved tenant id — satisfies the repository's mandatory
  // tenant-placeholder requirement while reading the tenant's own row by id.
  const rows = await repo.raw<TenantBrandingRow>(
    `SELECT business_name, logo_url, theme
       FROM tenants
      WHERE id = $1`,
    [tenantId],
  );

  const row = rows[0];
  if (!row) {
    throw new BrandingNotFoundError();
  }

  // Merge the tenant's partial theme override on top of the neutral platform
  // theme so every token has a value. The response `theme` is the fully merged
  // ThemeConfig (a superset of Partial<ThemeConfig>).
  const mergedTheme = deepMergeTheme(NEUTRAL_PLATFORM_THEME, row.theme);

  return {
    // Echo the resolved tenant id so the front-end can scope its realtime
    // channels to this tenant only (R12.7, R12.9).
    tenantId,
    businessName: row.business_name,
    logoUrl: row.logo_url,
    theme: mergedTheme,
  };
}
