import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import type { PlatformAdminRequest } from '../../middleware/platform-admin.middleware.js';

/**
 * Endpoint-level (controller) tests for `POST /api/platform/tenants` onboarding.
 *
 * Service-level tests (`tenant-provision.test.ts`, task 19) already cover the
 * transactional control flow: rollback on failure (Property 6), idempotency by
 * `provisioning_key` (Property 5) and input validation. These tests focus on the
 * HTTP/endpoint layer — status-code mapping and the audit trail — by mocking the
 * provisioning service, so we avoid duplicating the service's coverage while
 * proving the controller wires everything correctly:
 *   - 201 + tenant id on success;
 *   - 200 on an idempotent hit (re-sent provisioning_key);
 *   - 422 + invalid field list for invalid input (ProvisioningValidationError);
 *   - 500 on a rolled-back provisioning failure (ProvisioningError);
 *   - platform action audited (actor id + operation) on every path.
 *
 * The platform-admin authorization (403 for Tenant_Admin/Tenant_User) is proven
 * separately in `platform-admin-middleware.test.ts`, since the middleware gates
 * every `/api/platform/*` route before the controller runs.
 *
 * **Validates: Requirements 9.7, 9.8, 9.9, 10.2, 10.7**
 */

// Mock the shared pool / supabase so importing the real service module (via
// vi.importActual, to reuse its real error classes) does not open real
// connections or require Supabase env keys.
vi.mock('../../config/database.js', () => ({ pool: { connect: vi.fn() } }));
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock the provisioning service so the controller is tested in isolation.
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

// Capture audit entries instead of writing to the console.
const mockLogPlatformAction = vi.fn();
vi.mock('../../services/platform-audit.service.js', () => ({
  logPlatformAction: (...args: unknown[]) => mockLogPlatformAction(...args),
}));

import { createTenant } from '../../controllers/platform-tenant.controller.js';
import {
  ProvisioningValidationError,
  ProvisioningError,
} from '../../services/tenant-provision.service.js';

const ADMIN_ID = '99999999-9999-9999-9999-999999999999';

function mockRequest(body?: unknown): Partial<PlatformAdminRequest> {
  return {
    body: body ?? {},
    platformAdmin: { platformAdminId: ADMIN_ID, email: 'owner@platform.com' },
    user: { id: ADMIN_ID, email: 'owner@platform.com' },
  };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

const validBody = {
  provisioningKey: 'key-123',
  businessName: 'Pastel das Meninas',
  evolutionInstanceName: 'pastel-das-meninas',
  admin: { name: 'Admin', email: 'admin@pastel.com', password: 'S3nh@Forte' },
  menuPreset: { categories: [{ name: 'Salgados', items: [{ name: 'Pastel', priceCents: 900 }] }] },
};

describe('POST /api/platform/tenants — createTenant controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- 201 success ---

  it('returns 201 with the created tenant id on success', async () => {
    mockProvisionTenant.mockResolvedValueOnce({
      tenantId: 'tenant-new',
      adminUserId: 'auth-user-1',
      businessName: 'Pastel das Meninas',
      status: 'ativo',
      idempotentHit: false,
    });

    const req = mockRequest(validBody);
    const res = mockResponse();

    await createTenant(req as PlatformAdminRequest, res as unknown as Response);

    expect(res.statusCode).toBe(201);
    expect(res.body.tenantId).toBe('tenant-new');
    expect(res.body.idempotentHit).toBe(false);
    expect(mockProvisionTenant).toHaveBeenCalledWith(validBody);

    // Audit trail: actor id + operation (R10.7).
    expect(mockLogPlatformAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'CREATE_TENANT',
      expect.objectContaining({ tenantId: 'tenant-new', idempotentHit: false }),
    );
  });

  // --- 200 idempotent hit (R9.9) ---

  it('returns 200 (not 201) on an idempotent hit for a re-sent provisioning_key', async () => {
    mockProvisionTenant.mockResolvedValueOnce({
      tenantId: 'tenant-existing',
      adminUserId: 'admin-existing',
      businessName: 'Já Existe',
      status: 'ativo',
      idempotentHit: true,
    });

    const req = mockRequest(validBody);
    const res = mockResponse();

    await createTenant(req as PlatformAdminRequest, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.tenantId).toBe('tenant-existing');
    expect(res.body.idempotentHit).toBe(true);
    expect(mockLogPlatformAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'CREATE_TENANT',
      expect.objectContaining({ idempotentHit: true }),
    );
  });

  // --- 422 invalid input (R9.8) ---

  it('returns 422 with the invalid field list when input is invalid', async () => {
    mockProvisionTenant.mockRejectedValueOnce(
      new ProvisioningValidationError(['businessName', 'admin.email']),
    );

    const req = mockRequest({ ...validBody, businessName: '' });
    const res = mockResponse();

    await createTenant(req as PlatformAdminRequest, res as unknown as Response);

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.fields).toEqual(['businessName', 'admin.email']);
    expect(mockLogPlatformAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'CREATE_TENANT_REJECTED',
      expect.objectContaining({ fields: ['businessName', 'admin.email'] }),
    );
  });

  // --- 500 rolled-back provisioning failure (R9.7) ---

  it('returns 500 when provisioning fails and was rolled back', async () => {
    mockProvisionTenant.mockRejectedValueOnce(
      new ProvisioningError('Falha no provisionamento do tenant; alterações revertidas'),
    );

    const req = mockRequest(validBody);
    const res = mockResponse();

    await createTenant(req as PlatformAdminRequest, res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('PROVISIONING_FAILED');
    expect(mockLogPlatformAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'CREATE_TENANT_FAILED',
      expect.any(Object),
    );
  });

  // --- 500 unexpected error ---

  it('returns 500 on an unexpected (non-provisioning) error', async () => {
    mockProvisionTenant.mockRejectedValueOnce(new Error('boom'));

    const req = mockRequest(validBody);
    const res = mockResponse();

    await createTenant(req as PlatformAdminRequest, res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });

  // --- audit actor falls back to user id when platformAdmin context is absent ---

  it('uses the authenticated user id as the audit actor when platformAdmin is absent', async () => {
    mockProvisionTenant.mockResolvedValueOnce({
      tenantId: 'tenant-new',
      adminUserId: 'auth-user-1',
      businessName: 'X',
      status: 'ativo',
      idempotentHit: false,
    });

    const req = mockRequest(validBody);
    delete (req as PlatformAdminRequest).platformAdmin;
    const res = mockResponse();

    await createTenant(req as PlatformAdminRequest, res as unknown as Response);

    expect(res.statusCode).toBe(201);
    expect(mockLogPlatformAction).toHaveBeenCalledWith(
      ADMIN_ID,
      'CREATE_TENANT',
      expect.any(Object),
    );
  });
});
