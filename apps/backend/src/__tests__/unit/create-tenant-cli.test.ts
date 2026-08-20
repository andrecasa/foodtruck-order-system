import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Endpoint-adjacent tests for the CLI onboarding script `scripts/create-tenant.ts`.
 *
 * The transactional guarantees (rollback / idempotency / validation) are proven
 * at the service level (`tenant-provision.test.ts`, task 19). These tests focus
 * on the CLI layer: that flags/env are parsed into the `ProvisionTenantInput`,
 * that `provisionTenant` is invoked, and that the process exit code reflects the
 * outcome (0 success/idempotent, 2 invalid input, 1 provisioning failure).
 *
 * **Validates: Requirements 9.1, 9.5, 9.7, 9.8, 9.9**
 */

// Mock the shared pool / supabase so importing the service (transitively via the
// script) does not open real connections.
vi.mock('../../config/database.js', () => ({ pool: { connect: vi.fn() } }));
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

const mockProvisionTenant = vi.fn();
vi.mock('../../services/tenant-provision.service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../../services/tenant-provision.service.js')
  >('../../services/tenant-provision.service.js');
  return {
    ...actual,
    provisionTenant: (...args: unknown[]) => mockProvisionTenant(...args),
  };
});

import { main } from '../../../scripts/create-tenant.js';
import {
  ProvisioningValidationError,
  ProvisioningError,
} from '../../services/tenant-provision.service.js';

const baseArgs = [
  '--provisioning-key=key-001',
  '--business-name=Pastel das Meninas',
  '--evolution-instance=pastel-das-meninas',
  '--admin-name=Maria',
  '--admin-email=maria@pastel.com',
  '--admin-password=S3nh@Forte',
  '--menu-preset={"categories":[{"name":"Salgados","items":[{"name":"Pastel","priceCents":900}]}]}',
];

describe('create-tenant CLI script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('parses flags into the provisioning input and exits 0 on success', async () => {
    mockProvisionTenant.mockResolvedValueOnce({
      tenantId: 'tenant-new',
      adminUserId: 'auth-1',
      businessName: 'Pastel das Meninas',
      status: 'ativo',
      idempotentHit: false,
    });

    const code = await main(baseArgs);

    expect(code).toBe(0);
    expect(mockProvisionTenant).toHaveBeenCalledOnce();
    const input = mockProvisionTenant.mock.calls[0][0];
    expect(input).toMatchObject({
      provisioningKey: 'key-001',
      businessName: 'Pastel das Meninas',
      evolutionInstanceName: 'pastel-das-meninas',
      admin: { name: 'Maria', email: 'maria@pastel.com', password: 'S3nh@Forte' },
    });
    expect(input.menuPreset.categories[0].name).toBe('Salgados');
  });

  it('exits 0 on an idempotent hit', async () => {
    mockProvisionTenant.mockResolvedValueOnce({
      tenantId: 'tenant-existing',
      adminUserId: 'admin-existing',
      businessName: 'Já Existe',
      status: 'ativo',
      idempotentHit: true,
    });

    const code = await main(baseArgs);
    expect(code).toBe(0);
  });

  it('exits 2 on invalid input (ProvisioningValidationError)', async () => {
    mockProvisionTenant.mockRejectedValueOnce(
      new ProvisioningValidationError(['businessName']),
    );
    const code = await main(baseArgs);
    expect(code).toBe(2);
  });

  it('exits 1 on a rolled-back provisioning failure (ProvisioningError)', async () => {
    mockProvisionTenant.mockRejectedValueOnce(new ProvisioningError('reverted'));
    const code = await main(baseArgs);
    expect(code).toBe(1);
  });

  it('reads values from environment variables when flags are absent', async () => {
    mockProvisionTenant.mockResolvedValueOnce({
      tenantId: 'tenant-env',
      adminUserId: 'auth-1',
      businessName: 'Via Env',
      status: 'ativo',
      idempotentHit: false,
    });

    process.env.TENANT_PROVISIONING_KEY = 'env-key';
    process.env.TENANT_BUSINESS_NAME = 'Via Env';
    process.env.TENANT_EVOLUTION_INSTANCE = 'via-env';
    process.env.TENANT_ADMIN_NAME = 'Env Admin';
    process.env.TENANT_ADMIN_EMAIL = 'env@admin.com';
    process.env.TENANT_ADMIN_PASSWORD = 'EnvP@ss1';

    try {
      const code = await main([]);
      expect(code).toBe(0);
      const input = mockProvisionTenant.mock.calls[0][0];
      expect(input).toMatchObject({
        provisioningKey: 'env-key',
        businessName: 'Via Env',
        evolutionInstanceName: 'via-env',
        admin: { name: 'Env Admin', email: 'env@admin.com', password: 'EnvP@ss1' },
      });
    } finally {
      delete process.env.TENANT_PROVISIONING_KEY;
      delete process.env.TENANT_BUSINESS_NAME;
      delete process.env.TENANT_EVOLUTION_INSTANCE;
      delete process.env.TENANT_ADMIN_NAME;
      delete process.env.TENANT_ADMIN_EMAIL;
      delete process.env.TENANT_ADMIN_PASSWORD;
    }
  });
});
