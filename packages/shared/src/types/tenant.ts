import type { ThemeConfig } from './theme';

export type TenantStatus = 'ativo' | 'inativo';

export interface Tenant {
  id: string;
  businessName: string;
  logoUrl: string | null;
  theme: Partial<ThemeConfig> | null;
  timezone: string;
  status: TenantStatus;
}

export interface TenantBrandingResponse {
  /**
   * Resolved tenant id of the authenticated user. The front-end uses it to
   * subscribe only to its own tenant's realtime channels
   * (`orders:queue:{tenantId}` / `orders:payment:{tenantId}` — R12.7, R12.9).
   */
  tenantId: string;
  businessName: string;
  logoUrl: string | null;
  /**
   * Tenant slug (public `provisioning_key`), or `null` when the tenant has none.
   * Lets the operator app build the public ordering URL for the Home QR code.
   */
  slug: string | null;
  /** Partial override applied via deepMergeTheme over the neutral platform theme */
  theme: Partial<ThemeConfig>;
}
