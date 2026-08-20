import pg from 'pg';

const { Pool } = pg;

/**
 * Shared PostgreSQL connection pool.
 *
 * ISOLATION BOUNDARY (Requirements 5.6, 6): This pool is the single physical
 * gateway to the database. It MUST only be consumed by:
 *   - the centralized data-access helper (`db/tenant-repository.ts`), which
 *     always injects `tenant_id`, and
 *   - platform-level tooling that legitimately operates outside a tenant scope
 *     (the migration runner in `db/run-migrations.ts` and the onboarding /
 *     provisioning service).
 *
 * Domain services under `src/services/**` MUST NOT import `pool` directly; they
 * must go through `tenantRepository(tenantId)` so tenant isolation is guaranteed
 * by construction. An architecture test enforces this boundary.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || 'postgres'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'order_system'}`,
});
