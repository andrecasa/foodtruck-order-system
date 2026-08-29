/**
 * Tenant provisioning / onboarding service (Onboarding_Service).
 *
 * PLATFORM-LEVEL SERVICE — runs OUTSIDE any tenant scope. Unlike the domain
 * services under `src/services/**` (orders, menu, users, summary) which are
 * tenant-scoped and MUST go through `tenantRepository(tenantId)`, provisioning
 * is a platform operation that CREATES tenants. It therefore legitimately uses
 * the shared `pool` directly (like `db/run-migrations.ts`) so it can run a
 * single transaction spanning `tenants`, `users`, categories and menu items,
 * and roll the whole thing back atomically on any failure.
 *
 * The architecture test (`__tests__/unit/tenant-repository-architecture.test.ts`)
 * explicitly exempts this file via a PLATFORM allowlist, keeping the
 * tenant-scoped boundary intact and documented.
 *
 * Design: `.kiro/specs/multi-tenant-white-label/design.md` section 7
 *   "Onboarding / Provisionamento".
 * Requirements: 9.1–9.9. Correctness Properties 5 (idempotency) & 6 (atomicity).
 */

import type pg from 'pg';
import { pool } from '../config/database.js';
import { supabaseAdmin } from '../config/supabase.js';
import { provisionEvolutionInstance } from '../bot/evolution-api.client.js';
import type { ThemeConfig } from '@order-system/shared';

// --- Types ---

/** A single item within an onboarding menu preset category. */
export interface OnboardingMenuItem {
  name: string;
  priceCents: number;
}

/** A category (with its items) in an onboarding menu preset. */
export interface OnboardingCategory {
  name: string;
  sortOrder?: number;
  items: OnboardingMenuItem[];
}

/**
 * A parameterized onboarding preset: the initial menu seeded for a new tenant.
 * Replaces the old global `010_seed_menu.sql` (R9.6) — the initial menu is now
 * tenant onboarding data, not a global schema migration.
 */
export interface OnboardingPreset {
  categories: OnboardingCategory[];
}

/** Initial admin user for the new tenant (R9.3). */
export interface ProvisionAdminInput {
  name: string;
  email: string;
  password: string;
}

/** Input to `provisionTenant`. */
export interface ProvisionTenantInput {
  /**
   * Dual-purpose value (customer-ordering R1):
   *  1. Idempotency key for the whole provisioning request (R9.9 — Property 5):
   *     re-sending the same key never creates a second tenant.
   *  2. Public URL slug: `tenants.provisioning_key` doubles as the URL-friendly
   *     identifier used to resolve the tenant on public routes (`/:slug`). For
   *     that reason its format is validated on NEW-tenant creation (see
   *     `validateSlugFormat`). Existing tenants are never re-validated, so
   *     idempotent reprovision of legacy keys keeps working.
   */
  provisioningKey: string;
  /** Business name (1–120 chars, R1.1). */
  businessName: string;
  /** Optional branding. */
  logoUrl?: string | null;
  theme?: Partial<ThemeConfig> | null;
  /** IANA timezone; defaults to America/Sao_Paulo when omitted (R1.1). */
  timezone?: string;
  /** WhatsApp / Evolution instance configuration (R9.4). */
  evolutionInstanceName: string;
  whatsappConfig?: Record<string, unknown> | null;
  /** The tenant's first admin (R9.3). */
  admin: ProvisionAdminInput;
  /** Parameterized initial menu (R9.2, R9.6). */
  menuPreset: OnboardingPreset;
}

/** Result of a successful (or idempotent) provisioning. */
export interface ProvisionTenantResult {
  tenantId: string;
  adminUserId: string;
  businessName: string;
  status: 'ativo' | 'inativo';
  /** True when an existing tenant was returned via idempotency (R9.9). */
  idempotentHit: boolean;
}

/**
 * Error raised when provisioning input is invalid/incomplete. Carries the list
 * of invalid fields so the caller can report exactly what is wrong (R9.8).
 */
export class ProvisioningValidationError extends Error {
  constructor(public readonly fields: string[]) {
    super(`Dados de provisionamento inválidos: ${fields.join(', ')}`);
    this.name = 'ProvisioningValidationError';
  }
}

/** Error raised when a provisioning step fails; triggers full rollback (R9.7). */
export class ProvisioningError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

// --- Injectable side-effect dependencies (for testing / rollback) ---

/**
 * External side effects are injected so unit tests can supply fakes and so the
 * transaction can roll back the DB inserts when Evolution provisioning throws
 * (the real Evolution API may not be reachable in every environment).
 */
export interface ProvisionDeps {
  /** Creates the auth user; returns the created user's id. */
  createAuthUser: (email: string, password: string) => Promise<string>;
  /** Best-effort compensating delete of an auth user (rollback). */
  deleteAuthUser: (userId: string) => Promise<void>;
  /** Provisions the Evolution instance + webhook. Throws on failure. */
  provisionEvolution: (instanceName: string, webhookUrl: string) => Promise<void>;
  /** Base URL used to build the Evolution webhook target. */
  webhookBaseUrl: string;
  /** The connection pool (injectable for tests). */
  pool: Pick<typeof pool, 'connect'>;
}

const defaultDeps: ProvisionDeps = {
  async createAuthUser(email, password) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      throw new ProvisioningError('Falha ao criar usuário admin no Supabase Auth', error);
    }
    return data.user.id;
  },
  async deleteAuthUser(userId) {
    try {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } catch {
      // Best-effort rollback — do not mask the original failure.
    }
  },
  provisionEvolution(instanceName, webhookUrl) {
    return provisionEvolutionInstance({ instanceName, webhookUrl });
  },
  webhookBaseUrl: process.env.PUBLIC_API_URL || 'http://localhost:3000',
  pool,
};

// --- Validation (R9.8) ---

function validateInput(input: ProvisionTenantInput): void {
  const invalid: string[] = [];

  const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

  if (!isNonEmpty(input.provisioningKey)) invalid.push('provisioningKey');
  if (!isNonEmpty(input.businessName)) {
    invalid.push('businessName');
  } else if (input.businessName.trim().length > 120) {
    invalid.push('businessName');
  }
  if (!isNonEmpty(input.evolutionInstanceName)) invalid.push('evolutionInstanceName');

  if (!input.admin || typeof input.admin !== 'object') {
    invalid.push('admin');
  } else {
    if (!isNonEmpty(input.admin.name)) invalid.push('admin.name');
    if (!isNonEmpty(input.admin.email)) invalid.push('admin.email');
    if (!isNonEmpty(input.admin.password)) invalid.push('admin.password');
  }

  if (
    !input.menuPreset ||
    !Array.isArray(input.menuPreset.categories) ||
    input.menuPreset.categories.length === 0
  ) {
    invalid.push('menuPreset');
  }

  if (invalid.length > 0) {
    throw new ProvisioningValidationError(invalid);
  }
}

// --- Slug format validation (customer-ordering R1) ---

/**
 * URL-friendly slug format: 3–60 chars, lowercase letters/digits/hyphens, and
 * must neither start nor end with a hyphen. `provisioning_key` doubles as the
 * public slug (`/:slug`), so a NEW tenant's key must be a valid slug.
 */
const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

/**
 * Reserved words that collide with platform/public route prefixes and therefore
 * cannot be used as a tenant slug (customer-ordering R1.2).
 */
const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'health',
  'webhook',
  'static',
  'assets',
  'public',
  'login',
  'queue',
]);

/**
 * Validates that `provisioningKey` is a well-formed, non-reserved public slug.
 *
 * IMPORTANT: this runs ONLY for NEW tenants (after `findExistingByKey` returns
 * null). Reprovisioning an existing tenant must NOT re-validate the format, so
 * legacy tenants whose keys predate this rule keep working (idempotency, R9.9).
 */
function validateSlugFormat(provisioningKey: string): void {
  if (!SLUG_FORMAT.test(provisioningKey) || RESERVED_SLUGS.has(provisioningKey)) {
    throw new ProvisioningValidationError(['provisioningKey']);
  }
}

// --- Idempotency lookup (R9.9 — Property 5) ---

async function findExistingByKey(
  client: pg.PoolClient,
  provisioningKey: string,
): Promise<ProvisionTenantResult | null> {
  const tenantRes = await client.query(
    'SELECT id, business_name, status FROM tenants WHERE provisioning_key = $1',
    [provisioningKey],
  );
  if (tenantRes.rows.length === 0) return null;

  const tenant = tenantRes.rows[0];
  const adminRes = await client.query(
    "SELECT id FROM users WHERE tenant_id = $1 AND role = 'admin' ORDER BY created_at ASC LIMIT 1",
    [tenant.id],
  );

  return {
    tenantId: tenant.id,
    adminUserId: adminRes.rows[0]?.id ?? '',
    businessName: tenant.business_name,
    status: tenant.status,
    idempotentHit: true,
  };
}

// --- Main entry point ---

/**
 * Provisions a new tenant transactionally (R9.1–R9.9):
 *   1. validate input, rejecting BEFORE any write if invalid (R9.8);
 *   2. idempotency: return the existing tenant for a known `provisioning_key`
 *      without creating a duplicate (R9.9 — Property 5);
 *   2b. for a NEW tenant only, validate the `provisioning_key` slug format
 *      (customer-ordering R1) — skipped on idempotent reprovision;
 *   3. insert `tenants` (branding, theme, timezone, evolution_instance_name);
 *   4. seed the parameterized initial menu (categories + items) (R9.2, R9.6);
 *   5. create the admin (auth user + `users` row, role='admin') (R9.3);
 *   6. provision the Evolution instance + webhook (R9.4).
 *
 * Any failure rolls back ALL database inserts and best-effort deletes the auth
 * user, so no partially-created tenant remains usable (R9.7 — Property 6). No
 * code change or redeploy is required (R9.5).
 */
export async function provisionTenant(
  input: ProvisionTenantInput,
  depsOverride?: Partial<ProvisionDeps>,
): Promise<ProvisionTenantResult> {
  const deps: ProvisionDeps = { ...defaultDeps, ...depsOverride };

  // 1. Validate BEFORE any record is created (R9.8).
  validateInput(input);

  const timezone = input.timezone && input.timezone.trim() !== '' ? input.timezone : 'America/Sao_Paulo';

  const client = await deps.pool.connect();
  // Tracks the auth user created inside the tx so we can compensate on rollback
  // (auth user creation is a Supabase side-effect, not part of the DB tx).
  let createdAuthUserId: string | null = null;

  try {
    await client.query('BEGIN');

    // 2. Idempotency: same provisioning_key → return existing tenant (R9.9).
    const existing = await findExistingByKey(client, input.provisioningKey);
    if (existing) {
      await client.query('COMMIT');
      return existing;
    }

    // 2b. NEW tenant only: the provisioning_key becomes this tenant's public
    //     URL slug, so enforce the slug format here — AFTER the idempotency
    //     lookup — so existing/legacy keys are never re-validated (R1, R9.9).
    validateSlugFormat(input.provisioningKey);

    // 3. Insert the tenant (branding, theme, timezone, evolution instance).
    const tenantRes = await client.query(
      `INSERT INTO tenants
         (business_name, logo_url, theme, evolution_instance_name, whatsapp_config, timezone, status, provisioning_key)
       VALUES ($1, $2, $3, $4, $5, $6, 'ativo', $7)
       RETURNING id, business_name, status`,
      [
        input.businessName.trim(),
        input.logoUrl ?? null,
        input.theme ? JSON.stringify(input.theme) : null,
        input.evolutionInstanceName,
        input.whatsappConfig ? JSON.stringify(input.whatsappConfig) : null,
        timezone,
        input.provisioningKey,
      ],
    );
    const tenant = tenantRes.rows[0];
    const tenantId: string = tenant.id;

    // 4. Seed the parameterized initial menu (categories + items) (R9.2, R9.6).
    for (const [index, category] of input.menuPreset.categories.entries()) {
      const catRes = await client.query(
        `INSERT INTO categories (tenant_id, name, sort_order, status)
         VALUES ($1, $2, $3, 'ativo')
         RETURNING id`,
        [tenantId, category.name, category.sortOrder ?? index],
      );
      const categoryId: string = catRes.rows[0].id;

      for (const item of category.items) {
        await client.query(
          `INSERT INTO menu_items (tenant_id, name, price_cents, category_id, status)
           VALUES ($1, $2, $3, $4, 'ativo')`,
          [tenantId, item.name, item.priceCents, categoryId],
        );
      }
    }

    // 5. Create the admin: auth user + `users` row (role='admin') (R9.3).
    createdAuthUserId = await deps.createAuthUser(input.admin.email, input.admin.password);

    await client.query(
      `INSERT INTO users (id, tenant_id, email, name, role, status)
       VALUES ($1, $2, $3, $4, 'admin', 'ativo')`,
      [createdAuthUserId, tenantId, input.admin.email.toLowerCase(), input.admin.name],
    );

    // 6. Provision the Evolution instance + webhook (R9.4). If this throws, the
    //    catch below rolls back every DB insert above and deletes the auth user.
    const webhookUrl = `${deps.webhookBaseUrl.replace(/\/$/, '')}/api/webhook/evolution`;
    await deps.provisionEvolution(input.evolutionInstanceName, webhookUrl);

    await client.query('COMMIT');

    return {
      tenantId,
      adminUserId: createdAuthUserId,
      businessName: tenant.business_name,
      status: tenant.status,
      idempotentHit: false,
    };
  } catch (err) {
    // Full rollback of all DB inserts (R9.7 — Property 6).
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure; surface the original error
    }
    // Compensate the non-transactional auth user creation.
    if (createdAuthUserId) {
      await deps.deleteAuthUser(createdAuthUserId);
    }

    if (err instanceof ProvisioningValidationError || err instanceof ProvisioningError) {
      throw err;
    }
    throw new ProvisioningError('Falha no provisionamento do tenant; alterações revertidas', err);
  } finally {
    client.release();
  }
}
