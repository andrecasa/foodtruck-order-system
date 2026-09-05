import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';

/**
 * Unit tests for the platform admin authorization middleware (Platform_Admin).
 *
 * Covers:
 *  - 403 for a Tenant_Admin / Tenant_User (not present in `platform_admins`).
 *  - allow (next + context) for a Platform_Admin.
 *  - 401 without an authenticated user, 500 on DB error.
 *
 * **Validates: Requirements 10.1, 10.2, 10.4**
 */

// Mock the shared pool so we control the platform_admins lookup result.
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import {
  platformAdminMiddleware,
  type PlatformAdminRequest,
} from '../../middleware/platform-admin.middleware.js';

const ADMIN_ID = '99999999-9999-9999-9999-999999999999';

function mockRequest(user?: { id: string; email: string }): Partial<PlatformAdminRequest> {
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

describe('Platform Admin Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- allow: Platform_Admin (R10.1, R10.2) ---

  it('calls next and attaches req.platformAdmin for a platform admin (R10.2)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([{ id: ADMIN_ID, email: 'owner@platform.com' }]),
    );

    const req = mockRequest({ id: ADMIN_ID, email: 'owner@platform.com' });
    const res = mockResponse();
    let nextCalled = false;

    await platformAdminMiddleware(
      req as PlatformAdminRequest,
      res as unknown as Response,
      () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(0); // no error response written
    expect((req as PlatformAdminRequest).platformAdmin).toEqual({
      platformAdminId: ADMIN_ID,
      email: 'owner@platform.com',
    });

    // Resolution queries the platform_admins table by the auth user id.
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('FROM platform_admins');
    expect(params).toEqual([ADMIN_ID]);
  });

  // --- 403: Tenant_Admin / Tenant_User is NOT a platform admin (R10.4) ---

  it('returns 403 when the user is not a platform admin (Tenant_Admin/Tenant_User) (R10.4)', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const req = mockRequest({ id: 'tenant-user-1', email: 'admin@tenant.com' });
    const res = mockResponse();
    let nextCalled = false;

    await platformAdminMiddleware(
      req as PlatformAdminRequest,
      res as unknown as Response,
      () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect((req as PlatformAdminRequest).platformAdmin).toBeUndefined();
  });

  // --- 401: no authenticated user ---

  it('returns 401 when there is no authenticated user', async () => {
    const req = mockRequest(undefined);
    const res = mockResponse();
    let nextCalled = false;

    await platformAdminMiddleware(
      req as PlatformAdminRequest,
      res as unknown as Response,
      () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    // No I/O should occur without a user id.
    expect(pool.query).not.toHaveBeenCalled();
  });

  // --- 500: DB error ---

  it('returns 500 when the platform_admins lookup throws', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'));

    const req = mockRequest({ id: ADMIN_ID, email: 'owner@platform.com' });
    const res = mockResponse();
    let nextCalled = false;

    await platformAdminMiddleware(
      req as PlatformAdminRequest,
      res as unknown as Response,
      () => {
        nextCalled = true;
      },
    );

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
