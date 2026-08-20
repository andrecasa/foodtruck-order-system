import type pg from 'pg';
import { pool } from '../config/database.js';

/**
 * Centralized data-access helper (Data_Access_Helper) that guarantees tenant
 * isolation by construction. Every tenant-scoped query flows through here, and
 * `tenant_id` is injected automatically into SELECT / INSERT / UPDATE / DELETE.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 3.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7 (and 6 by extension).
 */

type PoolClient = pg.PoolClient;

/**
 * Raised when a tenant-scoped operation is requested without a resolved
 * `tenant_id`. Thrown by the factory BEFORE any I/O so no unscoped query can
 * ever reach the database (Requirements 5.7, 6.2 — Correctness Property 3).
 */
export class MissingTenantContextError extends Error {
  constructor(message = 'Tenant context ausente: nenhuma operação de dados pode ser executada sem tenant_id') {
    super(message);
    this.name = 'MissingTenantContextError';
  }
}

/**
 * Raised when `raw()` is called with SQL that does not reference the mandatory
 * tenant placeholder, which would allow an unscoped analytical query to slip
 * through the helper. The `raw()` escape hatch requires the tenant to be an
 * explicit parameter.
 */
export class MissingTenantPlaceholderError extends Error {
  constructor(message = 'raw() exige um placeholder de tenant ($1) referenciando o tenant_id resolvido') {
    super(message);
    this.name = 'MissingTenantPlaceholderError';
  }
}

/**
 * A parameterized SQL fragment. `text` uses `$1`, `$2`, ... placeholders that
 * are renumbered by the repository as it composes the final statement so the
 * injected `tenant_id` never collides with caller-provided parameters.
 */
export interface SqlFragment {
  text: string;
  params: unknown[];
}

export interface SelectOptions {
  where?: SqlFragment;
  orderBy?: string;
}

export interface FindOneOptions {
  where: SqlFragment;
}

export interface TenantRepository {
  /** Reads rows scoped to the tenant. Missing rows → empty array (never error). */
  select<T = Record<string, unknown>>(table: string, opts?: SelectOptions): Promise<T[]>;
  /** Reads a single row scoped to the tenant. No match → null (never error). */
  findOne<T = Record<string, unknown>>(table: string, opts: FindOneOptions): Promise<T | null>;
  /** Inserts a row, forcing `tenant_id` to the resolved tenant. Returns the row. */
  insert<T = Record<string, unknown>>(table: string, values: Record<string, unknown>): Promise<T>;
  /** Updates only rows of the resolved tenant. Returns affected row count. */
  update(table: string, set: Record<string, unknown>, where: SqlFragment): Promise<number>;
  /** Deletes only rows of the resolved tenant. Returns affected row count. */
  delete(table: string, where: SqlFragment): Promise<number>;
  /** Controlled escape hatch for complex SQL. `tenant_id` MUST be `$1`. */
  raw<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]>;
  /** Runs `fn` inside a transaction, passing a tenant-scoped repo bound to the tx client. */
  withTransaction<R>(fn: (txRepo: TenantRepository) => Promise<R>): Promise<R>;
  /** The tenant id this repository is bound to. */
  readonly tenantId: string;
}

/** Identifier allowlist: table/column names must be simple identifiers. */
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertIdentifier(name: string, kind: 'table' | 'column'): void {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`Nome de ${kind} inválido: ${JSON.stringify(name)}`);
  }
}

/**
 * Shifts every `$n` placeholder in a fragment by `offset`, so a caller fragment
 * written as `$1, $2` can be safely appended after the injected tenant param.
 */
function renumber(fragment: SqlFragment, offset: number): string {
  return fragment.text.replace(/\$(\d+)/g, (_m, digits: string) => `$${Number(digits) + offset}`);
}

/**
 * Detects whether a raw SQL string references at least the `$1` placeholder,
 * which by convention is the mandatory tenant_id parameter for `raw()`.
 */
function referencesTenantPlaceholder(sql: string): boolean {
  return /\$1\b/.test(sql);
}

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<pg.QueryResult>;
}

function createRepository(tenantId: string, executor: Queryable, poolForTx: typeof pool | null): TenantRepository {
  async function select<T>(table: string, opts: SelectOptions = {}): Promise<T[]> {
    assertIdentifier(table, 'table');
    // $1 is always the tenant_id; caller fragment params start at $2.
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM ${table} WHERE tenant_id = $1`;

    if (opts.where) {
      sql += ` AND (${renumber(opts.where, 1)})`;
      params.push(...opts.where.params);
    }

    if (opts.orderBy) {
      sql += ` ORDER BY ${opts.orderBy}`;
    }

    const result = await executor.query(sql, params);
    return result.rows as T[];
  }

  async function findOne<T>(table: string, opts: FindOneOptions): Promise<T | null> {
    const rows = await select<T>(table, { where: opts.where });
    return rows.length > 0 ? (rows[0] as T) : null;
  }

  async function insert<T>(table: string, values: Record<string, unknown>): Promise<T> {
    assertIdentifier(table, 'table');

    // Force tenant_id to the resolved tenant, ignoring any divergent value the
    // caller may have supplied (Requirement 5.4).
    const merged: Record<string, unknown> = { ...values, tenant_id: tenantId };
    const columns = Object.keys(merged);
    columns.forEach((c) => assertIdentifier(c, 'column'));

    const placeholders = columns.map((_c, i) => `$${i + 1}`);
    const params = columns.map((c) => merged[c]);

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await executor.query(sql, params);
    return result.rows[0] as T;
  }

  async function update(table: string, set: Record<string, unknown>, where: SqlFragment): Promise<number> {
    assertIdentifier(table, 'table');

    const setColumns = Object.keys(set);
    if (setColumns.length === 0) {
      throw new Error('update() requer ao menos uma coluna em "set"');
    }
    setColumns.forEach((c) => assertIdentifier(c, 'column'));

    const params: unknown[] = [];
    const setClauses = setColumns.map((c, i) => {
      params.push(set[c]);
      return `${c} = $${i + 1}`;
    });

    // tenant_id placeholder comes right after the SET params.
    const tenantParamIndex = setColumns.length + 1;
    params.push(tenantId);

    // Caller where-fragment params follow the tenant param.
    const whereText = renumber(where, tenantParamIndex);
    params.push(...where.params);

    const sql =
      `UPDATE ${table} SET ${setClauses.join(', ')} ` +
      `WHERE tenant_id = $${tenantParamIndex} AND (${whereText})`;

    const result = await executor.query(sql, params);
    return result.rowCount ?? 0;
  }

  async function del(table: string, where: SqlFragment): Promise<number> {
    assertIdentifier(table, 'table');

    const params: unknown[] = [tenantId];
    const whereText = renumber(where, 1);
    params.push(...where.params);

    const sql = `DELETE FROM ${table} WHERE tenant_id = $1 AND (${whereText})`;
    const result = await executor.query(sql, params);
    return result.rowCount ?? 0;
  }

  async function raw<T>(sql: string, params: unknown[]): Promise<T[]> {
    if (!referencesTenantPlaceholder(sql)) {
      throw new MissingTenantPlaceholderError();
    }
    const result = await executor.query(sql, params);
    return result.rows as T[];
  }

  async function withTransaction<R>(fn: (txRepo: TenantRepository) => Promise<R>): Promise<R> {
    // A transaction needs a dedicated client. When already running inside a tx
    // (poolForTx is null), reuse the current executor to keep the same tx.
    if (poolForTx === null) {
      return fn(createRepository(tenantId, executor, null));
    }

    const client = await poolForTx.connect();
    try {
      await client.query('BEGIN');
      const txRepo = createRepository(tenantId, client, null);
      const out = await fn(txRepo);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    tenantId,
    select,
    findOne,
    insert,
    update,
    delete: del,
    raw,
    withTransaction,
  };
}

/**
 * Creates a tenant-scoped repository. Throws `MissingTenantContextError` BEFORE
 * any I/O if `tenantId` is missing/empty (Requirements 5.7, 6.2 — Property 3).
 *
 * @param tenantId The resolved tenant id (from `tenantMiddleware`).
 * @param client   Optional existing `PoolClient` to run within an open transaction.
 */
export function tenantRepository(tenantId: string, client?: PoolClient): TenantRepository {
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    throw new MissingTenantContextError();
  }

  if (client) {
    // Bound to an existing transaction client; nested withTransaction reuses it.
    return createRepository(tenantId, client, null);
  }

  return createRepository(tenantId, pool, pool);
}
