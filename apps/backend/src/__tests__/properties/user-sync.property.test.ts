import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { adminMiddleware } from '../../middleware/role.middleware.js';
import type { AdminRequest } from '../../middleware/role.middleware.js';
import { syncUserMiddleware } from '../../middleware/sync-user.middleware.js';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import type { Response, NextFunction } from 'express';

/**
 * Feature: user-sync-bugfix, Bug Condition Exploration
 *
 * Demonstrates the bug: when a valid Supabase Auth UID is used that doesn't
 * exist in the `users` table, the adminMiddleware returns 401 with message
 * "Sessão inválida. Faça login novamente."
 *
 * This occurs because Supabase Auth users don't automatically get rows in the
 * application `users` table, so `SELECT role, status FROM users WHERE id = $1`
 * returns zero rows.
 *
 * **Validates: Bug Condition**
 */

// Mock the database pool
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';

const mockedPool = vi.mocked(pool);

describe('Bug Condition: adminMiddleware returns 401 for valid Auth UID not in users table', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID v4 format
  const validUuid = fc.uuid();

  // Generator: valid email address
  const validEmail = fc
    .tuple(
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 15,
      }),
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.constantFrom('com', 'org', 'net', 'io'),
    )
    .map(([local, domain, tld]) => `${local.join('')}@${domain.join('')}.${tld}`);

  it('returns 401 for any valid UUID that does not exist in the users table', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        // Mock pool.query to return empty rows (user not in DB)
        mockedPool.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as any);

        // Create mock request with authenticated user
        const req = {
          user: { id: uuid, email },
        } as AdminRequest;

        // Create mock response that captures status and json calls
        let capturedStatus: number | undefined;
        let capturedJson: any;
        const res = {
          status: (code: number) => {
            capturedStatus = code;
            return res;
          },
          json: (body: any) => {
            capturedJson = body;
            return res;
          },
        } as unknown as Response;

        const next: NextFunction = vi.fn();

        // Call adminMiddleware
        await adminMiddleware(req, res, next);

        // Bug behavior: middleware returns 401 because user doesn't exist in users table
        expect(capturedStatus).toBe(401);
        expect(capturedJson).toEqual({
          statusCode: 401,
          error: 'UNAUTHORIZED',
          message: 'Sessão inválida. Faça login novamente.',
        });
        expect(next).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});


/**
 * Property Tests for the multi-tenant syncUserMiddleware.
 *
 * In the multi-tenant model, `users.tenant_id` is NOT NULL and every user's
 * tenant is established by onboarding (spec task 19). Since this middleware runs
 * BEFORE the tenant is resolved and the request carries no tenant hint, it can
 * no longer synthesize a `tenant_id` for a brand-new user, nor apply a global
 * "first user becomes admin" rule. The first-admin-per-tenant decision now
 * belongs to onboarding.
 *
 * The middleware therefore:
 *   - never writes to the users table (no INSERT/UPDATE);
 *   - performs at most a single existence check;
 *   - always calls next(), deferring rejection of unprovisioned users to
 *     tenantMiddleware (which returns 401 — Requirement 4.7).
 *
 * **Validates: Requirements 2.1, 4.1**
 */
describe('Multi-tenant: syncUserMiddleware property tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: valid UUID v4 format
  const validUuid = fc.uuid();

  // Generator: valid email address
  const validEmail = fc
    .tuple(
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 15,
      }),
      fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
        minLength: 1,
        maxLength: 10,
      }),
      fc.constantFrom('com', 'org', 'net', 'io'),
    )
    .map(([local, domain, tld]) => `${local.join('')}@${domain.join('')}.${tld}`);

  // Generator: an already-provisioned user row (carries a tenant_id)
  const provisionedRowArb = fc.record({ id: fc.uuid(), tenant_id: fc.uuid() });

  /**
   * For a NEW (unprovisioned) user, the middleware must NOT create a row — it
   * cannot know the tenant — and must still call next() so tenantMiddleware can
   * reject it. Creating a row here would violate the NOT NULL tenant_id
   * invariant (R4.1).
   */
  it('does not INSERT a row for an unprovisioned user and still calls next()', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        mockedPool.query.mockReset();

        // User existence check returns empty (unprovisioned user).
        mockedPool.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as any);

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // No INSERT/UPDATE is ever issued by the middleware.
        const writeCalls = mockedPool.query.mock.calls.filter(
          (call) =>
            typeof call[0] === 'string' &&
            (call[0].includes('INSERT') || call[0].includes('UPDATE')),
        );
        expect(writeCalls).toHaveLength(0);
        // The chain continues; tenantMiddleware will handle the rejection.
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * For an EXISTING (provisioned) user, the middleware is a pure no-op: it makes
   * a single existence check and never writes, leaving the tenant-consistent row
   * untouched.
   */
  it('is a no-op for an existing provisioned user — single read, no writes', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, provisionedRowArb, async (uuid, email, row) => {
        mockedPool.query.mockReset();

        // Existence check returns a provisioned row (with tenant_id).
        mockedPool.query.mockResolvedValue({
          rows: [{ id: uuid, tenant_id: row.tenant_id }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as any);

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // Exactly one query (the existence check), and no writes.
        expect(mockedPool.query).toHaveBeenCalledTimes(1);
        const writeCalls = mockedPool.query.mock.calls.filter(
          (call) =>
            typeof call[0] === 'string' &&
            (call[0].includes('INSERT') || call[0].includes('UPDATE')),
        );
        expect(writeCalls).toHaveLength(0);
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * The middleware never blocks the request itself: even if the existence check
   * throws, it must call next() and let downstream middlewares resolve/reject.
   */
  it('always calls next(), even when the existence check fails', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        mockedPool.query.mockReset();
        mockedPool.query.mockRejectedValue(new Error('db down'));

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});
