import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';

/**
 * Unit tests for the tenant resolution middleware (Tenant_Resolution_Middleware).
 *
 * Covers the 401 / 403 / 403 rejection paths and the successful propagation of
 * `req.tenantId` / `req.tenantContext` to downstream layers. Inclui também o
 * bloqueio do Trial_Guard aplicado após a checagem de `status` (R12.2/R12.3) e
 * a permissão para trial vigente / tenant convertido / legado (R12.4).
 *
 * **Validates: Requirements 4.2, 4.4, 4.5, 4.7, 12.2, 12.3, 12.4**
 */

// Mock the shared pool so we control the tenant-resolution query result.
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import {
  tenantMiddleware,
  type AuthenticatedRequest,
} from '../../middleware/tenant.middleware.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

function mockRequest(user?: { id: string; email: string }): Partial<AuthenticatedRequest> {
  return { user };
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

describe('Tenant Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- 401: tenant not determinable from credentials (R4.7) ---

  it('returns 401 when there is no authenticated user (R4.7)', async () => {
    const req = mockRequest(undefined);
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('TENANT_RESOLUTION_FAILED');
    // No I/O should occur without a user id.
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('returns 401 when no user row is found (tenant_id undeterminable) (R4.7)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('TENANT_RESOLUTION_FAILED');
  });

  it('returns 401 when the resolved tenant_id is null (R4.7)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ tenant_id: null, status: null, timezone: null }]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('TENANT_RESOLUTION_FAILED');
  });

  // --- 403: user has no valid associated tenant (R4.4) ---

  it('returns 403 when the user resolves to a tenant with no valid association (R4.4)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT, status: null, timezone: null }]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('NO_TENANT_ASSOCIATED');
  });

  // --- 403: tenant inactive (R4.5) ---

  it('returns 403 when the resolved tenant is inactive (R4.5)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT, status: 'inativo', timezone: 'America/Sao_Paulo' }]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('TENANT_INACTIVE');
  });

  // --- Success: propagate req.tenantId / req.tenantContext (R4.2, R4.3, R4.6) ---

  it('calls next and propagates req.tenantId / req.tenantContext on success (R4.2, R4.3)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ tenant_id: TENANT, status: 'ativo', timezone: 'America/Sao_Paulo' }]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0); // no error response written
    expect((req as AuthenticatedRequest).tenantId).toBe(TENANT);
    expect((req as AuthenticatedRequest).tenantContext).toEqual({
      tenantId: TENANT,
      timezone: 'America/Sao_Paulo',
      status: 'ativo',
    });

    // Resolution uses the JOIN on users/tenants keyed by the user id.
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('FROM users u');
    expect(sql).toContain('JOIN tenants t');
    expect(params).toEqual(['user-1']);
  });

  it('returns 401 when the resolution query throws (R4.7)', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'));

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('TENANT_RESOLUTION_FAILED');
  });

  // --- 403: Trial_Guard bloqueia teste expirado e não convertido (R12.2/R12.3) ---

  it('returns 403 TRIAL_EXPIRED when the trial is expired and the tenant is not converted (R12.2, R12.3)', async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          tenant_id: TENANT,
          status: 'ativo',
          timezone: 'America/Sao_Paulo',
          trial_ends_at: expired,
          subscription_status: 'trial',
        },
      ]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('TRIAL_EXPIRED');
    expect((req as AuthenticatedRequest).tenantId).toBeUndefined();
  });

  it('allows access when the trial is still active (R12.4)', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          tenant_id: TENANT,
          status: 'ativo',
          timezone: 'America/Sao_Paulo',
          trial_ends_at: future,
          subscription_status: 'trial',
        },
      ]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0);
    expect((req as AuthenticatedRequest).tenantId).toBe(TENANT);
  });

  it('allows access when the tenant is converted even if the trial ended (R12.4)', async () => {
    const expired = new Date(Date.now() - 60_000).toISOString();
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          tenant_id: TENANT,
          status: 'ativo',
          timezone: 'America/Sao_Paulo',
          trial_ends_at: expired,
          subscription_status: 'active',
        },
      ]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0);
    expect((req as AuthenticatedRequest).tenantId).toBe(TENANT);
  });

  it('allows a legacy tenant without trial_ends_at (R12.4)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          tenant_id: TENANT,
          status: 'ativo',
          timezone: 'America/Sao_Paulo',
          trial_ends_at: null,
          subscription_status: 'trial',
        },
      ]),
    );

    const req = mockRequest({ id: 'user-1', email: 'a@b.com' });
    const res = mockResponse();
    let nextCalled = false;

    await tenantMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0);
    expect((req as AuthenticatedRequest).tenantId).toBe(TENANT);
  });
});
