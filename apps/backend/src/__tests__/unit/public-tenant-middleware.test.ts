import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';

/**
 * Unit tests for the public tenant resolution middleware (customer-ordering).
 *
 * Covers the 400 (invalid slug format) and 404 (unknown/inactive tenant)
 * rejection paths, plus the successful propagation of `req.tenantId` /
 * `req.tenantSlug` to the downstream public controllers.
 *
 * **Validates: Requirements 1.4, 2.3, 4.4, 5.4**
 */

// Mock the shared pool so we control the tenant-resolution query result.
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import {
  publicTenantMiddleware,
  PublicTenantRequest,
} from '../../middleware/public-tenant.middleware.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

function mockRequest(slug?: string): Partial<PublicTenantRequest> {
  return { params: { slug: slug as string } };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

function queryResult(rows: any[]) {
  return {
    rows,
    rowCount: rows.length,
    command: '',
    oid: 0,
    fields: [],
  } as never;
}

describe('Public Tenant Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- 400: invalid slug format, rejected BEFORE the DB (R1.4) ---

  it.each([
    ['ab', 'too short (< 3 chars)'],
    ['-leading', 'starts with a hyphen'],
    ['trailing-', 'ends with a hyphen'],
    ['UPPER', 'uppercase letters'],
    ['has space', 'contains a space'],
    ['under_score', 'contains an underscore'],
    ['a'.repeat(61), 'too long (> 60 chars)'],
    ['', 'empty slug'],
  ])('returns 400 INVALID_SLUG_FORMAT for %s (%s)', async (slug) => {
    const req = mockRequest(slug);
    const res = mockResponse();
    let nextCalled = false;

    await publicTenantMiddleware(req as PublicTenantRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_SLUG_FORMAT');
    // A malformed slug must never reach the database.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 400 when the slug param is missing', async () => {
    const req = mockRequest(undefined);
    const res = mockResponse();
    let nextCalled = false;

    await publicTenantMiddleware(req as PublicTenantRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_SLUG_FORMAT');
    expect(pool.query).not.toHaveBeenCalled();
  });

  // --- 404: well-formed slug but no active tenant (R1.4, R2.3, R4.4, R5.4) ---

  it('returns 404 TENANT_NOT_FOUND when no active tenant matches the slug', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const req = mockRequest('pastel-das-meninas');
    const res = mockResponse();
    let nextCalled = false;

    await publicTenantMiddleware(req as PublicTenantRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('TENANT_NOT_FOUND');
    expect(res.body.message).toBe('Estabelecimento não encontrado.');

    // Resolution filters on provisioning_key AND active status.
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('FROM tenants');
    expect(sql).toContain('provisioning_key = $1');
    expect(sql).toContain("status = 'ativo'");
    expect(params).toEqual(['pastel-das-meninas']);
  });

  // --- Success: propagate req.tenantId / req.tenantSlug (R2.2) ---

  it('calls next and propagates req.tenantId / req.tenantSlug on success', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ id: TENANT }]));

    const req = mockRequest('pastel-das-meninas');
    const res = mockResponse();
    let nextCalled = false;

    await publicTenantMiddleware(req as PublicTenantRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0); // no error response written
    expect((req as PublicTenantRequest).tenantId).toBe(TENANT);
    expect((req as PublicTenantRequest).tenantSlug).toBe('pastel-das-meninas');
  });

  it('returns 500 when the resolution query throws', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'));

    const req = mockRequest('pastel-das-meninas');
    const res = mockResponse();
    let nextCalled = false;

    await publicTenantMiddleware(req as PublicTenantRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
