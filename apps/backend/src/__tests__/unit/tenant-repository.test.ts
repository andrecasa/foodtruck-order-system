import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Unit + property tests for the centralized data-access helper (TenantRepository).
 *
 * Verifies:
 *  - `tenant_id` is injected into SELECT / findOne / INSERT / UPDATE / DELETE.
 *  - Reads with no matching rows return empty / null (never an error) — R5.2.
 *  - Any operation requested without a resolved tenant throws
 *    `MissingTenantContextError` before any I/O — Correctness Property 3 (R5.7).
 *  - `raw()` requires a mandatory tenant placeholder.
 *
 * **Validates: Requirements 5.1, 5.6, 5.7**
 */

// Mock the shared pool so we can assert the SQL/params the repository builds
// and confirm no I/O happens when the tenant context is missing.
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import {
  tenantRepository,
  MissingTenantContextError,
  MissingTenantPlaceholderError,
} from '../../db/tenant-repository.js';

function queryResult(rows: any[], rowCount?: number) {
  return {
    rows,
    rowCount: rowCount ?? rows.length,
    command: '',
    oid: 0,
    fields: [],
  } as never;
}

const TENANT = '11111111-1111-1111-1111-111111111111';

describe('TenantRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Missing tenant context (Property 3, R5.7) ---

  describe('missing tenant context (Property 3, R5.7)', () => {
    it.each([undefined, null, '', '   '])(
      'throws MissingTenantContextError before any I/O when tenantId is %p',
      (bad) => {
        expect(() => tenantRepository(bad as unknown as string)).toThrow(MissingTenantContextError);
        // No database call should have occurred.
        expect(pool.query).not.toHaveBeenCalled();
        expect(pool.connect).not.toHaveBeenCalled();
      },
    );

    it('property: for any blank/whitespace tenantId the factory never performs I/O', () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^\s*$/),
          (blank) => {
            vi.clearAllMocks();
            expect(() => tenantRepository(blank)).toThrow(MissingTenantContextError);
            expect(pool.query).not.toHaveBeenCalled();
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // --- SELECT injects tenant_id (R5.1, R5.3) ---

  describe('select', () => {
    it('injects tenant_id as $1 in the WHERE clause', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ id: 'a', tenant_id: TENANT }]));

      const repo = tenantRepository(TENANT);
      const rows = await repo.select('orders');

      expect(rows).toHaveLength(1);
      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      expect(sql).toContain('SELECT * FROM orders');
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(params).toEqual([TENANT]);
    });

    it('appends a caller where-fragment with renumbered placeholders after tenant_id', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

      const repo = tenantRepository(TENANT);
      await repo.select('orders', {
        where: { text: 'status = $1 AND daily_number = $2', params: ['pronto', 7] },
        orderBy: 'created_at ASC',
      });

      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      expect(sql).toContain('WHERE tenant_id = $1');
      // caller $1/$2 must be shifted to $2/$3 so they never clash with tenant_id
      expect(sql).toContain('(status = $2 AND daily_number = $3)');
      expect(sql).toContain('ORDER BY created_at ASC');
      expect(params).toEqual([TENANT, 'pronto', 7]);
    });

    it('returns an empty array (not an error) when there are no matching rows (R5.2)', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

      const repo = tenantRepository(TENANT);
      await expect(repo.select('orders')).resolves.toEqual([]);
    });
  });

  // --- findOne (R5.2, R5.3) ---

  describe('findOne', () => {
    it('injects tenant_id and returns the first matching row', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ id: 'x', tenant_id: TENANT }]));

      const repo = tenantRepository(TENANT);
      const row = await repo.findOne('menu_items', { where: { text: 'id = $1', params: ['x'] } });

      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      expect(sql).toContain('WHERE tenant_id = $1');
      expect(sql).toContain('(id = $2)');
      expect(params).toEqual([TENANT, 'x']);
      expect(row).toEqual({ id: 'x', tenant_id: TENANT });
    });

    it('returns null (not an error) when no row matches (R5.2)', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

      const repo = tenantRepository(TENANT);
      await expect(
        repo.findOne('menu_items', { where: { text: 'id = $1', params: ['missing'] } }),
      ).resolves.toBeNull();
    });
  });

  // --- INSERT forces tenant_id (R5.4) ---

  describe('insert', () => {
    it('injects tenant_id into the inserted columns', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ id: 'new', name: 'Bebidas', tenant_id: TENANT }]));

      const repo = tenantRepository(TENANT);
      await repo.insert('categories', { name: 'Bebidas', sort_order: 0 });

      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      expect(sql).toContain('INSERT INTO categories');
      expect(sql).toContain('tenant_id');
      expect(sql).toContain('RETURNING *');
      // tenant_id value must be present in the params
      expect(params).toContain(TENANT);
    });

    it('overrides any divergent tenant_id supplied by the caller (R5.4)', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ id: 'new', tenant_id: TENANT }]));

      const repo = tenantRepository(TENANT);
      await repo.insert('categories', { name: 'X', tenant_id: 'someone-elses-tenant' });

      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      const columns = (sql.match(/\(([^)]+)\)\s+VALUES/) as RegExpMatchArray)[1]
        .split(',')
        .map((c) => c.trim());
      const tenantIdx = columns.indexOf('tenant_id');
      expect(tenantIdx).toBeGreaterThanOrEqual(0);
      // The value at the tenant_id column position must be the resolved tenant.
      expect(params[tenantIdx]).toBe(TENANT);
      expect(params).not.toContain('someone-elses-tenant');
    });
  });

  // --- UPDATE scopes to tenant (R5.5) ---

  describe('update', () => {
    it('scopes the UPDATE to tenant_id and returns the affected row count', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([], 1));

      const repo = tenantRepository(TENANT);
      const affected = await repo.update(
        'orders',
        { status: 'preparando' },
        { text: 'id = $1', params: ['order-1'] },
      );

      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      expect(sql).toContain('UPDATE orders SET status = $1');
      // tenant placeholder is $2 (after the single SET param), caller where is $3
      expect(sql).toContain('WHERE tenant_id = $2 AND (id = $3)');
      expect(params).toEqual(['preparando', TENANT, 'order-1']);
      expect(affected).toBe(1);
    });

    it('returns 0 when no row of the tenant matches (cross-tenant → 404 upstream)', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([], 0));

      const repo = tenantRepository(TENANT);
      const affected = await repo.update(
        'orders',
        { status: 'x' },
        { text: 'id = $1', params: ['other-tenant-order'] },
      );
      expect(affected).toBe(0);
    });
  });

  // --- DELETE scopes to tenant (R5.5) ---

  describe('delete', () => {
    it('scopes the DELETE to tenant_id and returns the affected row count', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([], 1));

      const repo = tenantRepository(TENANT);
      const affected = await repo.delete('categories', { text: 'id = $1', params: ['cat-1'] });

      const [sql, params] = vi.mocked(pool.query).mock.calls[0];
      expect(sql).toContain('DELETE FROM categories WHERE tenant_id = $1 AND (id = $2)');
      expect(params).toEqual([TENANT, 'cat-1']);
      expect(affected).toBe(1);
    });
  });

  // --- raw requires the tenant placeholder ---

  describe('raw', () => {
    it('executes when the SQL references the mandatory $1 tenant placeholder', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ total: 3 }]));

      const repo = tenantRepository(TENANT);
      const rows = await repo.raw('SELECT COUNT(*) AS total FROM orders WHERE tenant_id = $1', [TENANT]);

      expect(rows).toEqual([{ total: 3 }]);
      expect(pool.query).toHaveBeenCalledOnce();
    });

    it('throws MissingTenantPlaceholderError and performs no I/O when $1 is absent', async () => {
      const repo = tenantRepository(TENANT);
      await expect(repo.raw('SELECT COUNT(*) FROM orders', [])).rejects.toThrow(
        MissingTenantPlaceholderError,
      );
      expect(pool.query).not.toHaveBeenCalled();
    });
  });

  // --- withTransaction ---

  describe('withTransaction', () => {
    it('runs the callback within BEGIN/COMMIT on a dedicated client scoped to the tenant', async () => {
      const client = {
        query: vi.fn().mockResolvedValue(queryResult([])),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const repo = tenantRepository(TENANT);
      const result = await repo.withTransaction(async (txRepo) => {
        expect(txRepo.tenantId).toBe(TENANT);
        await txRepo.insert('categories', { name: 'Tx' });
        return 'ok';
      });

      expect(result).toBe('ok');
      const calls = client.query.mock.calls.map((c) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls.some((c: string) => c.startsWith('INSERT INTO categories'))).toBe(true);
      expect(calls[calls.length - 1]).toBe('COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    });

    it('rolls back and rethrows when the callback throws', async () => {
      const client = {
        query: vi.fn().mockResolvedValue(queryResult([])),
        release: vi.fn(),
      };
      vi.mocked(pool.connect).mockResolvedValueOnce(client as never);

      const repo = tenantRepository(TENANT);
      const boom = new Error('boom');
      await expect(
        repo.withTransaction(async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);

      const calls = client.query.mock.calls.map((c) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(calls).not.toContain('COMMIT');
      expect(client.release).toHaveBeenCalledOnce();
    });
  });

  // --- Property 3: injection is always present across generated inputs ---

  describe('Property 3: tenant filter always present', () => {
    it('every select/update/delete built for any valid tenant contains tenant_id filtering', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), async (tid) => {
          vi.clearAllMocks();
          vi.mocked(pool.query).mockResolvedValue(queryResult([], 0));

          const repo = tenantRepository(tid);
          await repo.select('orders');
          await repo.update('orders', { status: 's' }, { text: 'id = $1', params: ['x'] });
          await repo.delete('orders', { text: 'id = $1', params: ['x'] });

          for (const call of vi.mocked(pool.query).mock.calls) {
            const sql = call[0] as string;
            const params = call[1] as unknown[];
            expect(sql).toMatch(/tenant_id = \$\d+/);
            expect(params).toContain(tid);
          }
        }),
        { numRuns: 50 },
      );
    });
  });
});
