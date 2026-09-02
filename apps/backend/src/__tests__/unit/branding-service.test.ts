import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the Branding_Service and its GET /api/tenant/branding
 * controller.
 *
 * Covers: reading the tenant's own row scoped by id, merging the tenant's
 * partial theme over the neutral platform theme, the not-found path, and the
 * missing-tenant guard.
 *
 * **Validates: Requirements 7.1, 7.6, 7.7, 11.3**
 */

// Mock the shared pool so we control what the tenantRepository reads and assert
// the SQL/params (the tenant id must be the mandatory $1 placeholder).
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import { getBranding, BrandingNotFoundError } from '../../services/branding.service.js';
import { getBranding as getBrandingController } from '../../controllers/branding.controller.js';
import { NEUTRAL_PLATFORM_THEME } from '../../theme/platform-theme.js';
import { MissingTenantContextError } from '../../db/tenant-repository.js';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';
import type { Response } from 'express';

const TENANT = '11111111-1111-1111-1111-111111111111';

function queryResult(rows: unknown[]) {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  } as never;
}

function mockResponse(): Response & { statusCode: number; body: unknown } {
  const res: Record<string, unknown> = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: unknown) {
      res.body = data;
      return res;
    },
  };
  return res as Response & { statusCode: number; body: unknown };
}

describe('BrandingService.getBranding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the tenant own row scoped by id ($1 = tenantId) (R7.1, R11.3)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ business_name: 'Loja X', logo_url: 'https://x/logo.png', theme: null }]),
    );

    await getBranding(TENANT);

    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('FROM tenants');
    expect(sql).toContain('WHERE id = $1');
    expect(params).toEqual([TENANT]);
  });

  it('returns businessName and logoUrl from the tenant row, not hardcoded (R7.6)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ business_name: 'Loja X', logo_url: 'https://x/logo.png', theme: null }]),
    );

    const result = await getBranding(TENANT);

    expect(result.businessName).toBe('Loja X');
    expect(result.logoUrl).toBe('https://x/logo.png');
  });

  it('maps provisioning_key to slug (used by the operator Home QR)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        { business_name: 'Loja X', logo_url: null, provisioning_key: 'loja-x', theme: null },
      ]),
    );

    const result = await getBranding(TENANT);

    expect(result.slug).toBe('loja-x');
  });

  it('falls back to the neutral platform theme when tenant theme is null (R11.3)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ business_name: 'Loja X', logo_url: null, theme: null }]),
    );

    const result = await getBranding(TENANT);

    expect(result.theme).toEqual(NEUTRAL_PLATFORM_THEME);
    expect(result.logoUrl).toBeNull();
  });

  it('merges the tenant partial theme over the neutral platform theme (R11.3)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          business_name: 'Loja X',
          logo_url: null,
          theme: { colors: { primary: '#FF0000' }, spacing: { md: 20 } },
        },
      ]),
    );

    const result = await getBranding(TENANT);

    // Overridden tokens win…
    expect(result.theme.colors.primary).toBe('#FF0000');
    expect(result.theme.spacing.md).toBe(20);
    // …while every non-overridden token keeps the neutral platform value.
    expect(result.theme.colors.secondary).toBe(NEUTRAL_PLATFORM_THEME.colors.secondary);
    expect(result.theme.colors.text).toBe(NEUTRAL_PLATFORM_THEME.colors.text);
    expect(result.theme.spacing.sm).toBe(NEUTRAL_PLATFORM_THEME.spacing.sm);
    expect(result.theme.typography.sizes.md).toBe(NEUTRAL_PLATFORM_THEME.typography.sizes.md);
  });

  it('throws BrandingNotFoundError when no tenant row exists', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    await expect(getBranding(TENANT)).rejects.toBeInstanceOf(BrandingNotFoundError);
  });

  it('throws MissingTenantContextError (no I/O) when tenantId is empty (R5.7)', async () => {
    await expect(getBranding('')).rejects.toBeInstanceOf(MissingTenantContextError);
    // The repository factory rejects before any query is issued.
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('GET /api/tenant/branding controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the branding payload on success (R7.1)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ business_name: 'Loja X', logo_url: null, theme: null }]),
    );

    const req = { tenantId: TENANT } as AuthenticatedRequest;
    const res = mockResponse();

    await getBrandingController(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.body as { businessName: string; theme: unknown };
    expect(body.businessName).toBe('Loja X');
    expect(body.theme).toEqual(NEUTRAL_PLATFORM_THEME);
  });

  it('returns 401 when req.tenantId is missing', async () => {
    const req = {} as AuthenticatedRequest;
    const res = mockResponse();

    await getBrandingController(req, res);

    expect(res.statusCode).toBe(401);
    expect((res.body as { error: string }).error).toBe('TENANT_RESOLUTION_FAILED');
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the tenant branding is not found', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const req = { tenantId: TENANT } as AuthenticatedRequest;
    const res = mockResponse();

    await getBrandingController(req, res);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: string }).error).toBe('BRANDING_NOT_FOUND');
  });

  it('returns 500 on an unexpected error', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'));

    const req = { tenantId: TENANT } as AuthenticatedRequest;
    const res = mockResponse();

    await getBrandingController(req, res);

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: string }).error).toBe('INTERNAL_ERROR');
  });
});
