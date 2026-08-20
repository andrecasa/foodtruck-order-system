import { describe, it, expect, beforeAll } from 'vitest';
import pg from 'pg';
import {
  validateMigrationsFromEmpty,
  getAdminConnection,
  TENANT_SCOPED_TABLES,
  REQUIRED_UNIQUE_INDEXES,
  REQUIRED_COMPOSITE_PKS,
} from '../../db/validate-schema.js';

const { Client } = pg;

/**
 * Feature: multi-tenant-white-label, Task 3.
 *
 * Validates that the migration set (001–010) applies cleanly against an EMPTY
 * database and produces the final, valid multi-tenant schema without manual
 * intervention.
 *
 * **Validates: Requirements 1.9, 1.10, 1.14**
 *
 * The test requires a reachable PostgreSQL server (same one used by the app /
 * CI). When no server is reachable it is skipped, so the suite still runs in
 * environments without a database. In CI a Postgres service is provided, so the
 * check runs for real (see .github/workflows/migrations.yml).
 */

async function isDatabaseReachable(): Promise<boolean> {
  const admin = getAdminConnection();
  const client = new Client({ ...admin, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

describe('multi-tenant migrations — clean apply from empty database', () => {
  let dbReachable = false;

  beforeAll(async () => {
    dbReachable = await isDatabaseReachable();
    if (!dbReachable) {
      console.warn(
        '[migrations-schema.test] No PostgreSQL server reachable — skipping live schema validation. ' +
          'This check runs in CI where a Postgres service is available.'
      );
    }
  });

  it('applies all migrations from zero and produces the final multi-tenant schema', async () => {
    if (!dbReachable) {
      expect(dbReachable).toBe(false); // documented skip
      return;
    }

    const result = await validateMigrationsFromEmpty();

    if (!result.ok) {
      throw new Error(
        `Schema validation failed:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`
      );
    }

    expect(result.ok).toBe(true);

    // Every tenant-scoped table has NOT NULL tenant_id and a FK to tenants.
    for (const table of TENANT_SCOPED_TABLES) {
      expect(result.checks).toContain(`${table}.tenant_id NOT NULL`);
      expect(result.checks).toContain(`${table}.tenant_id FK -> tenants(id)`);
    }

    // Composite unique indexes (per-tenant uniqueness).
    for (const idx of REQUIRED_UNIQUE_INDEXES) {
      expect(result.checks).toContain(`unique index ${idx} exists`);
    }

    // Composite primary keys.
    for (const [table, cols] of Object.entries(REQUIRED_COMPOSITE_PKS)) {
      expect(result.checks).toContain(`${table} PK = (${cols.join(', ')})`);
    }

    // Daily numbering function.
    expect(result.checks).toContain('next_daily_number(uuid, date) exists');
  }, 60_000);
});
