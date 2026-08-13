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
 * Regression Property Tests for syncUserMiddleware
 *
 * Validates that the fix works correctly and doesn't regress existing behavior.
 */
describe('Regression: syncUserMiddleware property tests', () => {
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

  /**
   * 4.1 - After syncUserMiddleware runs for a new user, an INSERT is issued
   * **Validates: Requirements 2.1**
   */
  it('creates a new user record when user does not exist in users table', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        // Clear mocks between iterations
        mockedPool.query.mockReset();

        // Mock: first SELECT returns empty (user not found), second SELECT returns empty (no admin), INSERT succeeds
        mockedPool.query.mockImplementation(async (sql: string) => {
          if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE id')) {
            return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
          }
          if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
            return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
          }
          if (typeof sql === 'string' && sql.includes('INSERT INTO users')) {
            return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
          }
          return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
        });

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // Verify INSERT was called with user's id and email as first two params
        const insertCall = mockedPool.query.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO users'),
        );
        expect(insertCall).toBeDefined();
        const params = insertCall![1] as string[];
        expect(params[0]).toBe(uuid);
        expect(params[1]).toBe(email);
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * 4.2 - Existing users are NOT overwritten when syncUserMiddleware runs
   * **Validates: Requirements 3.1**
   */
  it('does not overwrite existing users — no INSERT or UPDATE is issued', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        // Mock: SELECT returns a row (user already exists)
        mockedPool.query.mockImplementation(async (sql: string) => {
          if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE id')) {
            return { rows: [{ id: uuid }], rowCount: 1, command: 'SELECT', oid: 0, fields: [] };
          }
          return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
        });

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // Verify no INSERT or UPDATE was attempted
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
   * 4.3 - First user gets role 'admin' when no admins exist
   * **Validates: Requirements 2.2**
   */
  it('assigns admin role to first user when no admins exist in the table', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        // Mock: user doesn't exist, no admin exists
        mockedPool.query.mockImplementation(async (sql: string) => {
          if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE id')) {
            return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
          }
          if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
            return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
          }
          if (typeof sql === 'string' && sql.includes('INSERT INTO users')) {
            return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
          }
          return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
        });

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // Verify INSERT was called with role='admin' (4th param)
        const insertCall = mockedPool.query.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO users'),
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]![3]).toBe('admin');
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * 4.4 - Subsequent users get role 'atendente' when an admin already exists
   * **Validates: Requirements 2.2**
   */
  it('assigns atendente role to subsequent users when an admin already exists', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        // Mock: user doesn't exist, but an admin already exists
        mockedPool.query.mockImplementation(async (sql: string) => {
          if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE id')) {
            return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };
          }
          if (typeof sql === 'string' && sql.includes("role = 'admin'")) {
            return {
              rows: [{ id: 'existing-admin-id' }],
              rowCount: 1,
              command: 'SELECT',
              oid: 0,
              fields: [],
            };
          }
          if (typeof sql === 'string' && sql.includes('INSERT INTO users')) {
            return { rows: [], rowCount: 1, command: 'INSERT', oid: 0, fields: [] };
          }
          return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
        });

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // Verify INSERT was called with role='atendente' (4th param)
        const insertCall = mockedPool.query.mock.calls.find(
          (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO users'),
        );
        expect(insertCall).toBeDefined();
        expect(insertCall![1]![3]).toBe('atendente');
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  /**
   * 4.5 - Inactive users remain unchanged (sync doesn't reactivate them)
   * **Validates: Requirements 3.3**
   */
  it('does not modify inactive users — sync is a no-op for existing users regardless of status', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validEmail, async (uuid, email) => {
        // Clear mocks between iterations
        mockedPool.query.mockReset();

        // Mock: user already exists (with status='inativo' implied)
        // The middleware only checks SELECT id — if row exists, it skips INSERT entirely
        mockedPool.query.mockImplementation(async (sql: string) => {
          if (typeof sql === 'string' && sql.includes('SELECT id FROM users WHERE id')) {
            return {
              rows: [{ id: uuid }],
              rowCount: 1,
              command: 'SELECT',
              oid: 0,
              fields: [],
            };
          }
          return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
        });

        const req = { user: { id: uuid, email } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        // Verify: only one query was made (the existence check)
        expect(mockedPool.query).toHaveBeenCalledTimes(1);
        // No INSERT, UPDATE, or any status modification
        const writeCalls = mockedPool.query.mock.calls.filter(
          (call) =>
            typeof call[0] === 'string' &&
            (call[0].includes('INSERT') ||
              call[0].includes('UPDATE') ||
              call[0].includes('status')),
        );
        expect(writeCalls).toHaveLength(0);
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
