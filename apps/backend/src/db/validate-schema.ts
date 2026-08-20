/**
 * Schema validation for the multi-tenant migration set.
 *
 * Applies the full migration set (001–010) against a FRESH, EMPTY database and
 * asserts that the resulting schema is the final multi-tenant form, without any
 * manual intervention (Requirements 1.9, 1.10, 1.14).
 *
 * Invariants checked:
 *  - Every tenant-scoped table exists with a `tenant_id` column that is NOT NULL.
 *  - Every tenant-scoped table has a foreign key `tenant_id -> tenants(id)`.
 *  - Composite unique indexes exist (users email, categories name, active menu
 *    items, orders daily number).
 *  - Composite primary keys exist for `daily_sequences (tenant_id, order_date)`
 *    and `whatsapp_sessions (tenant_id, phone_number)`.
 *  - The `next_daily_number(uuid, date)` function exists.
 *
 * Usage (against a throwaway database on an existing server):
 *   tsx --env-file=../../.env src/db/validate-schema.ts
 *
 * The validator creates a uniquely-named temporary database, runs the migrations
 * there, validates, and drops it again — so it never touches the application DB.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool, Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIGRATIONS_DIR = join(__dirname, '../../migrations');

/** Tables that must be tenant-scoped (own a NOT NULL tenant_id FK to tenants). */
export const TENANT_SCOPED_TABLES = [
  'users',
  'categories',
  'menu_items',
  'orders',
  'order_items',
  'daily_sequences',
  'whatsapp_sessions',
] as const;

/** Composite unique indexes that enforce per-tenant uniqueness (R2). */
export const REQUIRED_UNIQUE_INDEXES = [
  'users_tenant_email_lower_idx',
  'categories_tenant_name_lower_idx',
  'menu_items_tenant_name_active_idx',
  'orders_tenant_date_number_idx',
] as const;

/** Composite primary keys that must be scoped by tenant. */
export const REQUIRED_COMPOSITE_PKS: Record<string, string[]> = {
  daily_sequences: ['tenant_id', 'order_date'],
  whatsapp_sessions: ['tenant_id', 'phone_number'],
};

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
  checks: string[];
}

interface ConnectionParts {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Resolves connection parts to an ADMIN database (default `postgres`), used to
 * create/drop the temporary validation database. DATABASE_URL takes precedence.
 */
export function getAdminConnection(): ConnectionParts {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return {
      host: u.hostname,
      port: parseInt(u.port || '5432', 10),
      user: decodeURIComponent(u.username || 'postgres'),
      password: decodeURIComponent(u.password || 'postgres'),
      database: 'postgres',
    };
  }
  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: 'postgres',
  };
}

async function getMigrationFiles(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Applies every migration file, each inside its own transaction, so a failing
 * migration leaves the schema in its prior state (R1.10).
 */
async function applyMigrations(pool: InstanceType<typeof Pool>): Promise<void> {
  const files = await getMigrationFiles();
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf-8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}

/** Runs all schema invariant checks against an already-migrated database. */
export async function checkSchema(pool: InstanceType<typeof Pool>): Promise<SchemaValidationResult> {
  const errors: string[] = [];
  const checks: string[] = [];

  // 1. tenants table exists
  const tenants = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenants'`
  );
  if (tenants.rowCount === 0) {
    errors.push('Missing table: tenants');
  } else {
    checks.push('tenants table exists');
  }

  // 2. tenant_id NOT NULL on every scoped table
  const cols = await pool.query<{ table_name: string; is_nullable: string }>(
    `SELECT table_name, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND column_name='tenant_id'`
  );
  const colByTable = new Map(cols.rows.map((r) => [r.table_name, r.is_nullable]));
  for (const t of TENANT_SCOPED_TABLES) {
    const nullable = colByTable.get(t);
    if (nullable === undefined) {
      errors.push(`Table ${t} is missing column tenant_id`);
    } else if (nullable !== 'NO') {
      errors.push(`Column ${t}.tenant_id must be NOT NULL`);
    } else {
      checks.push(`${t}.tenant_id NOT NULL`);
    }
  }

  // 3. tenant_id FK -> tenants(id) on every scoped table
  const fks = await pool.query<{ table_name: string }>(
    `SELECT tc.table_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
     WHERE tc.constraint_type='FOREIGN KEY'
       AND tc.table_schema='public'
       AND kcu.column_name='tenant_id'
       AND ccu.table_name='tenants'`
  );
  const fkTables = new Set(fks.rows.map((r) => r.table_name));
  for (const t of TENANT_SCOPED_TABLES) {
    if (!fkTables.has(t)) {
      errors.push(`Table ${t} is missing FK tenant_id -> tenants(id)`);
    } else {
      checks.push(`${t}.tenant_id FK -> tenants(id)`);
    }
  }

  // 4. Composite unique indexes exist
  const idx = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public'`
  );
  const idxNames = new Set(idx.rows.map((r) => r.indexname));
  for (const name of REQUIRED_UNIQUE_INDEXES) {
    if (!idxNames.has(name)) {
      errors.push(`Missing unique index: ${name}`);
    } else {
      checks.push(`unique index ${name} exists`);
    }
  }

  // 5. Composite primary keys
  const pks = await pool.query<{ table_name: string; column_name: string; ordinal_position: number }>(
    `SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     WHERE tc.constraint_type='PRIMARY KEY' AND tc.table_schema='public'`
  );
  for (const [table, expected] of Object.entries(REQUIRED_COMPOSITE_PKS)) {
    const actual = pks.rows
      .filter((r) => r.table_name === table)
      .sort((a, b) => a.ordinal_position - b.ordinal_position)
      .map((r) => r.column_name);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(
        `Table ${table} PK expected (${expected.join(', ')}) but got (${actual.join(', ') || 'none'})`
      );
    } else {
      checks.push(`${table} PK = (${expected.join(', ')})`);
    }
  }

  // 6. next_daily_number(uuid, date) function exists
  const fn = await pool.query<{ args: string }>(
    `SELECT pg_get_function_identity_arguments(oid) AS args FROM pg_proc WHERE proname='next_daily_number'`
  );
  const hasFn = fn.rows.some((r) => /uuid/.test(r.args) && /date/.test(r.args));
  if (!hasFn) {
    errors.push('Missing function next_daily_number(uuid, date)');
  } else {
    checks.push('next_daily_number(uuid, date) exists');
  }

  return { ok: errors.length === 0, errors, checks };
}

/**
 * Full validation flow: create a fresh temp DB, apply migrations from zero,
 * validate the schema, then drop the temp DB. Returns the validation result.
 */
export async function validateMigrationsFromEmpty(): Promise<SchemaValidationResult> {
  const admin = getAdminConnection();
  const tmpDb = `mt_schema_validate_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const adminClient = new Client(admin);
  await adminClient.connect();
  try {
    await adminClient.query(`CREATE DATABASE "${tmpDb}"`);
  } finally {
    await adminClient.end();
  }

  const pool = new Pool({ ...admin, database: tmpDb });
  let result: SchemaValidationResult;
  try {
    await applyMigrations(pool);
    result = await checkSchema(pool);
  } finally {
    await pool.end();
    const cleanup = new Client(admin);
    await cleanup.connect();
    try {
      // Terminate any lingering connections before dropping.
      await cleanup.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`,
        [tmpDb]
      );
      await cleanup.query(`DROP DATABASE IF EXISTS "${tmpDb}"`);
    } finally {
      await cleanup.end();
    }
  }

  return result;
}

// Allow running directly via: tsx src/db/validate-schema.ts
const isMainModule =
  process.argv[1] &&
  (process.argv[1].includes('validate-schema') || fileURLToPath(import.meta.url) === process.argv[1]);

if (isMainModule) {
  validateMigrationsFromEmpty()
    .then((result) => {
      for (const c of result.checks) {
        console.log(`[schema-validate] ✓ ${c}`);
      }
      if (!result.ok) {
        console.error('\n[schema-validate] Schema validation FAILED:');
        for (const e of result.errors) {
          console.error(`[schema-validate] ✗ ${e}`);
        }
        process.exit(1);
      }
      console.log(`\n[schema-validate] OK — ${result.checks.length} checks passed on a clean database.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[schema-validate] Failed:', err);
      process.exit(1);
    });
}
