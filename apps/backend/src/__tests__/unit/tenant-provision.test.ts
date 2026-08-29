import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// Mock supabaseAdmin so importing the service does not construct a real Supabase
// client at module load (which requires env keys). All auth side effects are
// injected via `deps` in these tests, so the mock only needs to exist.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock the shared pool import so the service module can load without opening a
// real DB connection. The tests inject their own fake pool via `deps.pool`.
vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn() },
}));

import {
  provisionTenant,
  ProvisioningValidationError,
  ProvisioningError,
  type ProvisionTenantInput,
  type ProvisionDeps,
} from '../../services/tenant-provision.service.js';

/**
 * Unit + property tests for the tenant provisioning / onboarding service.
 *
 * Covers:
 *  - input validation before any write (R9.8)
 *  - idempotency by provisioning_key (R9.9 — Correctness Property 5)
 *  - full rollback on failure (R9.7 — Correctness Property 6)
 *
 * The external side effects (DB pool, Supabase Auth, Evolution API) are faked so
 * the tests run without a real database or reachable Evolution API, while still
 * asserting the real transactional control flow (BEGIN/COMMIT/ROLLBACK, inserts,
 * and compensating auth deletion).
 */

// --- Fake pool client that records the queries it runs ---

interface RecordedQuery {
  text: string;
  params?: unknown[];
}

interface FakeClientOptions {
  /** Rows returned by the idempotency lookup (SELECT ... FROM tenants WHERE provisioning_key). */
  existingTenantRows?: Record<string, unknown>[];
  /** Rows returned by the admin lookup for an existing tenant. */
  existingAdminRows?: Record<string, unknown>[];
  /** If set, the query whose text matches this substring throws. */
  failOnQueryContaining?: string;
}

function makeFakeClient(opts: FakeClientOptions = {}) {
  const queries: RecordedQuery[] = [];
  let released = false;

  const client = {
    async query(text: string, params?: unknown[]) {
      queries.push({ text, params });

      if (opts.failOnQueryContaining && text.includes(opts.failOnQueryContaining)) {
        throw new Error(`Simulated DB failure on: ${opts.failOnQueryContaining}`);
      }

      // Idempotency lookup on tenants by provisioning_key.
      if (/SELECT .*FROM tenants WHERE provisioning_key/i.test(text)) {
        return { rows: opts.existingTenantRows ?? [], rowCount: (opts.existingTenantRows ?? []).length };
      }
      // Admin lookup for an existing tenant.
      if (/SELECT id FROM users WHERE tenant_id/i.test(text)) {
        return { rows: opts.existingAdminRows ?? [], rowCount: (opts.existingAdminRows ?? []).length };
      }
      // Tenant insert.
      if (/INSERT INTO tenants/i.test(text)) {
        return { rows: [{ id: 'tenant-new', business_name: (params?.[0] as string) ?? 'X', status: 'ativo' }], rowCount: 1 };
      }
      // Category insert.
      if (/INSERT INTO categories/i.test(text)) {
        return { rows: [{ id: `cat-${queries.length}` }], rowCount: 1 };
      }
      // Everything else (BEGIN/COMMIT/ROLLBACK, menu_items, users insert).
      return { rows: [], rowCount: 0 };
    },
    release() {
      released = true;
    },
  };

  return {
    client,
    queries,
    wasReleased: () => released,
  };
}

function makeDeps(clientBundle: ReturnType<typeof makeFakeClient>, over?: Partial<ProvisionDeps>): {
  deps: Partial<ProvisionDeps>;
  createAuthUser: ReturnType<typeof vi.fn>;
  deleteAuthUser: ReturnType<typeof vi.fn>;
  provisionEvolution: ReturnType<typeof vi.fn>;
} {
  const createAuthUser = vi.fn(async () => 'auth-user-1');
  const deleteAuthUser = vi.fn(async () => {});
  const provisionEvolution = vi.fn(async () => {});

  const deps: Partial<ProvisionDeps> = {
    createAuthUser,
    deleteAuthUser,
    provisionEvolution,
    webhookBaseUrl: 'https://api.example.com',
    pool: { connect: async () => clientBundle.client as never },
    ...over,
  };

  return { deps, createAuthUser, deleteAuthUser, provisionEvolution };
}

function validInput(overrides: Partial<ProvisionTenantInput> = {}): ProvisionTenantInput {
  return {
    provisioningKey: 'key-123',
    businessName: 'Pastel das Meninas',
    evolutionInstanceName: 'pastel-das-meninas',
    admin: { name: 'Admin', email: 'admin@pastel.com', password: 'Sup3rSecret!' },
    menuPreset: {
      categories: [
        { name: 'Salgados', items: [{ name: 'Pastel de Carne', priceCents: 900 }] },
      ],
    },
    ...overrides,
  };
}

describe('provisionTenant — input validation (R9.8)', () => {
  it('rejects invalid input BEFORE creating any record', async () => {
    const bundle = makeFakeClient();
    const { deps, createAuthUser, provisionEvolution } = makeDeps(bundle);

    await expect(
      provisionTenant(validInput({ businessName: '   ' }), deps),
    ).rejects.toBeInstanceOf(ProvisioningValidationError);

    // No DB connection, no auth user, no Evolution call happened.
    expect(bundle.queries).toHaveLength(0);
    expect(createAuthUser).not.toHaveBeenCalled();
    expect(provisionEvolution).not.toHaveBeenCalled();
  });

  it('reports every invalid field', async () => {
    const bundle = makeFakeClient();
    const { deps } = makeDeps(bundle);

    const bad = validInput({
      provisioningKey: '',
      businessName: '',
      evolutionInstanceName: '',
      admin: { name: '', email: '', password: '' },
      menuPreset: { categories: [] },
    });

    try {
      await provisionTenant(bad, deps);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProvisioningValidationError);
      const fields = (err as ProvisioningValidationError).fields;
      expect(fields).toEqual(
        expect.arrayContaining([
          'provisioningKey',
          'businessName',
          'evolutionInstanceName',
          'admin.name',
          'admin.email',
          'admin.password',
          'menuPreset',
        ]),
      );
    }
  });

  it('rejects a business name longer than 120 chars', async () => {
    const bundle = makeFakeClient();
    const { deps } = makeDeps(bundle);
    await expect(
      provisionTenant(validInput({ businessName: 'a'.repeat(121) }), deps),
    ).rejects.toBeInstanceOf(ProvisioningValidationError);
    expect(bundle.queries).toHaveLength(0);
  });
});

describe('provisionTenant — slug format validation on NEW tenant (customer-ordering R1)', () => {
  it('accepts a well-formed slug when creating a new tenant', async () => {
    const bundle = makeFakeClient();
    const { deps } = makeDeps(bundle);

    const result = await provisionTenant(validInput({ provisioningKey: 'pastel-das-meninas' }), deps);

    expect(result.idempotentHit).toBe(false);
    expect(bundle.queries.some((q) => /INSERT INTO tenants/.test(q.text))).toBe(true);
  });

  it('accepts existing keys (dev-first-tenant, pastel-das-meninas) on new-tenant creation', async () => {
    for (const key of ['dev-first-tenant', 'pastel-das-meninas']) {
      const bundle = makeFakeClient();
      const { deps } = makeDeps(bundle);
      const result = await provisionTenant(validInput({ provisioningKey: key }), deps);
      expect(result.idempotentHit).toBe(false);
    }
  });

  it('rejects invalid-format keys with provisioningKey in the invalid fields', async () => {
    const invalidKeys = [
      'ab', // too short (< 3)
      '-leading', // starts with hyphen
      'trailing-', // ends with hyphen
      'Upper-Case', // uppercase not allowed
      'has space', // space not allowed
      'under_score', // underscore not allowed
      'a'.repeat(61), // too long (> 60)
    ];

    for (const key of invalidKeys) {
      const bundle = makeFakeClient();
      const { deps } = makeDeps(bundle);
      try {
        await provisionTenant(validInput({ provisioningKey: key }), deps);
        throw new Error(`should have rejected key: ${key}`);
      } catch (err) {
        expect(err).toBeInstanceOf(ProvisioningValidationError);
        expect((err as ProvisioningValidationError).fields).toContain('provisioningKey');
      }
      // No tenant was inserted.
      expect(bundle.queries.some((q) => /INSERT INTO tenants/.test(q.text))).toBe(false);
    }
  });

  it('rejects reserved words as slugs', async () => {
    const reserved = ['api', 'admin', 'health', 'webhook', 'static', 'assets', 'public', 'login', 'queue'];

    for (const key of reserved) {
      const bundle = makeFakeClient();
      const { deps } = makeDeps(bundle);
      await expect(
        provisionTenant(validInput({ provisioningKey: key }), deps),
      ).rejects.toBeInstanceOf(ProvisioningValidationError);
      expect(bundle.queries.some((q) => /INSERT INTO tenants/.test(q.text))).toBe(false);
    }
  });

  it('does NOT re-validate slug format on idempotent reprovision of an existing tenant', async () => {
    // A legacy tenant whose key would fail the new slug rules (reserved word)
    // must still be returned idempotently without a format check.
    const bundle = makeFakeClient({
      existingTenantRows: [{ id: 'tenant-legacy', business_name: 'Legado', status: 'ativo' }],
      existingAdminRows: [{ id: 'admin-legacy' }],
    });
    const { deps } = makeDeps(bundle);

    const result = await provisionTenant(validInput({ provisioningKey: 'admin' }), deps);

    expect(result.idempotentHit).toBe(true);
    expect(result.tenantId).toBe('tenant-legacy');
    // Idempotent path commits and never inserts a new tenant.
    expect(bundle.queries.some((q) => /INSERT INTO tenants/.test(q.text))).toBe(false);
  });

  it('property: only slugs matching the format+reserved rules are accepted for new tenants', async () => {
    const SLUG_FORMAT = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
    const RESERVED = new Set([
      'api', 'admin', 'health', 'webhook', 'static', 'assets', 'public', 'login', 'queue',
    ]);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 0, maxLength: 65 }),
        async (key) => {
          const bundle = makeFakeClient();
          const { deps } = makeDeps(bundle);

          const shouldAccept = SLUG_FORMAT.test(key) && !RESERVED.has(key);

          if (shouldAccept) {
            const result = await provisionTenant(validInput({ provisioningKey: key }), deps);
            expect(result.idempotentHit).toBe(false);
          } else {
            await expect(
              provisionTenant(validInput({ provisioningKey: key }), deps),
            ).rejects.toBeInstanceOf(ProvisioningValidationError);
            expect(bundle.queries.some((q) => /INSERT INTO tenants/.test(q.text))).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe('provisionTenant — happy path', () => {
  it('creates tenant, seeds menu, creates admin, and provisions Evolution', async () => {
    const bundle = makeFakeClient();
    const { deps, createAuthUser, provisionEvolution } = makeDeps(bundle);

    const result = await provisionTenant(validInput(), deps);

    expect(result.idempotentHit).toBe(false);
    expect(result.tenantId).toBe('tenant-new');
    expect(result.adminUserId).toBe('auth-user-1');

    const texts = bundle.queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('BEGIN'))).toBe(true);
    expect(texts.some((t) => /INSERT INTO tenants/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO categories/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO menu_items/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO users/.test(t))).toBe(true);
    expect(texts.some((t) => t.includes('COMMIT'))).toBe(true);
    expect(texts.some((t) => t.includes('ROLLBACK'))).toBe(false);

    expect(createAuthUser).toHaveBeenCalledOnce();
    expect(provisionEvolution).toHaveBeenCalledWith(
      'pastel-das-meninas',
      'https://api.example.com/api/webhook/evolution',
    );
    expect(bundle.wasReleased()).toBe(true);
  });
});

describe('provisionTenant — idempotency by provisioning_key (R9.9, Property 5)', () => {
  it('returns the existing tenant without inserting a duplicate', async () => {
    const bundle = makeFakeClient({
      existingTenantRows: [{ id: 'tenant-existing', business_name: 'Já Existe', status: 'ativo' }],
      existingAdminRows: [{ id: 'admin-existing' }],
    });
    const { deps, createAuthUser, provisionEvolution } = makeDeps(bundle);

    const result = await provisionTenant(validInput(), deps);

    expect(result.idempotentHit).toBe(true);
    expect(result.tenantId).toBe('tenant-existing');
    expect(result.adminUserId).toBe('admin-existing');

    const texts = bundle.queries.map((q) => q.text);
    expect(texts.some((t) => /INSERT INTO tenants/.test(t))).toBe(false);
    expect(texts.some((t) => t.includes('COMMIT'))).toBe(true);
    expect(createAuthUser).not.toHaveBeenCalled();
    expect(provisionEvolution).not.toHaveBeenCalled();
  });

  // Property 5: calling provisionTenant N times with the same key yields exactly
  // one tenant. We model the shared store: the first call inserts, subsequent
  // calls find the existing tenant.
  it('property: N calls with same provisioning_key create exactly one tenant', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (n) => {
        // Shared "database": a single-slot store keyed by provisioning_key.
        const store = new Map<string, { id: string; business_name: string; status: string }>();
        let insertCount = 0;

        function connectShared() {
          const queries: RecordedQuery[] = [];
          let localTenantId = '';
          return {
            async query(text: string, params?: unknown[]) {
              queries.push({ text, params });
              if (/SELECT .*FROM tenants WHERE provisioning_key/i.test(text)) {
                const existing = store.get(params?.[0] as string);
                return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
              }
              if (/SELECT id FROM users WHERE tenant_id/i.test(text)) {
                return { rows: [{ id: 'admin-x' }], rowCount: 1 };
              }
              if (/INSERT INTO tenants/i.test(text)) {
                insertCount += 1;
                localTenantId = `tenant-${insertCount}`;
                const row = { id: localTenantId, business_name: params?.[0] as string, status: 'ativo' };
                store.set(params?.[6] as string, row); // $7 is provisioning_key
                return { rows: [row], rowCount: 1 };
              }
              if (/INSERT INTO categories/i.test(text)) {
                return { rows: [{ id: 'cat-1' }], rowCount: 1 };
              }
              return { rows: [], rowCount: 0 };
            },
            release() {},
          };
        }

        const deps: Partial<ProvisionDeps> = {
          createAuthUser: vi.fn(async () => 'auth-user'),
          deleteAuthUser: vi.fn(async () => {}),
          provisionEvolution: vi.fn(async () => {}),
          webhookBaseUrl: 'https://api.example.com',
          pool: { connect: async () => connectShared() as never },
        };

        const key = 'same-key';
        for (let i = 0; i < n; i++) {
          await provisionTenant(validInput({ provisioningKey: key }), deps);
        }

        expect(insertCount).toBe(1);
        expect(store.size).toBe(1);
      }),
      { numRuns: 25 },
    );
  });
});

describe('provisionTenant — rollback on failure (R9.7, Property 6)', () => {
  it('rolls back all DB inserts and deletes the auth user when Evolution provisioning fails', async () => {
    const bundle = makeFakeClient();
    const provisionEvolution = vi.fn(async () => {
      throw new Error('Evolution unreachable');
    });
    const { deps, createAuthUser, deleteAuthUser } = makeDeps(bundle, { provisionEvolution });

    await expect(provisionTenant(validInput(), deps)).rejects.toBeInstanceOf(ProvisioningError);

    const texts = bundle.queries.map((q) => q.text);
    // The tenant/menu/user inserts happened, but the transaction rolled back.
    expect(texts.some((t) => t.includes('BEGIN'))).toBe(true);
    expect(texts.some((t) => /INSERT INTO tenants/.test(t))).toBe(true);
    expect(texts.some((t) => t.includes('ROLLBACK'))).toBe(true);
    expect(texts.some((t) => t.includes('COMMIT'))).toBe(false);

    // Auth user was created then compensated by a delete (R9.7).
    expect(createAuthUser).toHaveBeenCalledOnce();
    expect(deleteAuthUser).toHaveBeenCalledWith('auth-user-1');
    expect(bundle.wasReleased()).toBe(true);
  });

  it('rolls back when a DB insert (menu seeding) fails; no auth user was created yet', async () => {
    const bundle = makeFakeClient({ failOnQueryContaining: 'INSERT INTO menu_items' });
    const { deps, createAuthUser, deleteAuthUser } = makeDeps(bundle);

    await expect(provisionTenant(validInput(), deps)).rejects.toBeInstanceOf(ProvisioningError);

    const texts = bundle.queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('ROLLBACK'))).toBe(true);
    expect(texts.some((t) => t.includes('COMMIT'))).toBe(false);
    // Menu seeding fails before admin creation → no auth user to compensate.
    expect(createAuthUser).not.toHaveBeenCalled();
    expect(deleteAuthUser).not.toHaveBeenCalled();
    expect(bundle.wasReleased()).toBe(true);
  });

  it('rolls back and compensates when the users insert fails after auth creation', async () => {
    const bundle = makeFakeClient({ failOnQueryContaining: 'INSERT INTO users' });
    const { deps, createAuthUser, deleteAuthUser, provisionEvolution } = makeDeps(bundle);

    await expect(provisionTenant(validInput(), deps)).rejects.toBeInstanceOf(ProvisioningError);

    const texts = bundle.queries.map((q) => q.text);
    expect(texts.some((t) => t.includes('ROLLBACK'))).toBe(true);
    expect(createAuthUser).toHaveBeenCalledOnce();
    expect(deleteAuthUser).toHaveBeenCalledWith('auth-user-1');
    // Evolution provisioning is never reached because users insert failed first.
    expect(provisionEvolution).not.toHaveBeenCalled();
  });

  // Property 6: after ANY failing step, there is never a committed tenant.
  it('property: any failing step results in ROLLBACK, never COMMIT', async () => {
    const failPoints = ['INSERT INTO tenants', 'INSERT INTO categories', 'INSERT INTO menu_items', 'INSERT INTO users'];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...failPoints), async (failAt) => {
        const bundle = makeFakeClient({ failOnQueryContaining: failAt });
        const { deps } = makeDeps(bundle);

        await expect(provisionTenant(validInput(), deps)).rejects.toBeInstanceOf(ProvisioningError);

        const texts = bundle.queries.map((q) => q.text);
        expect(texts.some((t) => t.includes('COMMIT'))).toBe(false);
        expect(texts.some((t) => t.includes('ROLLBACK'))).toBe(true);
        expect(bundle.wasReleased()).toBe(true);
      }),
      { numRuns: 20 },
    );
  });
});
