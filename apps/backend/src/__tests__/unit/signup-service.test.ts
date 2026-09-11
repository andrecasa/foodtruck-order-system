import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabaseAdmin para que importar o serviço (via tenant-provision.service)
// não construa um cliente Supabase real no load do módulo (exige env keys).
// Os efeitos de auth são injetados via deps nos testes, então o mock só precisa
// existir. Mesmo padrão de `tenant-provision.test.ts`.
vi.mock('../../config/supabase.js', () => ({
  supabase: {},
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// Mock do pool compartilhado para o módulo carregar sem abrir conexão real; os
// testes injetam seu próprio pool falso via `deps.pool`.
vi.mock('../../config/database.js', () => ({
  pool: { connect: vi.fn(), query: vi.fn() },
}));

import {
  signup,
  ServiceError,
  type SignupDeps,
  type SignupInputForService,
} from '../../services/signup.service.js';
import {
  ProvisioningValidationError,
  ProvisioningError,
} from '../../services/tenant-provision.service.js';

/**
 * Testes example-based do `Signup_Service` (orquestração do cadastro
 * self-service, PLATFORM-LEVEL). As dependências com efeito colateral (upload
 * S3, provisionamento e pool) são injetadas via `SignupDeps`, de modo que o
 * fluxo é exercitado SEM I/O real. As property tests numeradas (7.2–7.6) são
 * tarefas separadas; aqui cobrimos o caminho feliz e os principais desvios
 * (conflitos, idempotência, mapeamento de erros do provisionamento).
 *
 * _Requirements: 3.7, 5.4, 6.3, 6.6, 6.7, 7.5, 8.3, 8.5, 10.1, 10.2, 10.3, 11.1_
 */

/** Entrada de cadastro válida base para os testes. */
const baseInput: SignupInputForService = {
  businessName: 'Restaurante Teste',
  contactName: 'Maria Responsável',
  contactPhone: '+55 (11) 99999-1234',
  adminName: 'Admin Teste',
  adminEmail: 'admin@teste.com',
  password: 'senhaForte1',
  slug: 'restaurante-teste',
  colorPresetId: 'classico',
};

/** Pool mockado: por padrão, slug livre e e-mail livre (nenhum conflito). */
function makePool(rowsByCall: Array<Array<Record<string, unknown>>>): SignupDeps['pool'] {
  const query = vi.fn();
  for (const rows of rowsByCall) {
    query.mockResolvedValueOnce({ rows });
  }
  // Fallback: qualquer chamada extra retorna vazio.
  query.mockResolvedValue({ rows: [] });
  return { query } as unknown as SignupDeps['pool'];
}

describe('Signup_Service.signup', () => {
  beforeEach(() => {
    process.env.ASSETS_S3_BUCKET = 'assets-test';
    process.env.ASSETS_PUBLIC_BASE_URL = 'https://foodtruck.app.br';
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.ASSETS_S3_BUCKET;
    delete process.env.ASSETS_PUBLIC_BASE_URL;
  });

  it('rejeita preset de cores inexistente com 422 VALIDATION_ERROR (R6.3)', async () => {
    const deps: Partial<SignupDeps> = {
      pool: makePool([[]]),
      provisionTenant: vi.fn(),
      uploadLogo: vi.fn(),
    };

    await expect(
      signup({ ...baseInput, colorPresetId: 'inexistente-xyz' }, deps),
    ).rejects.toMatchObject({ statusCode: 422, code: 'VALIDATION_ERROR' });

    expect(deps.provisionTenant).not.toHaveBeenCalled();
    expect(deps.uploadLogo).not.toHaveBeenCalled();
  });

  it('provisiona um tenant novo com trialEndsAt = now + 30d e tema do preset (caminho feliz)', async () => {
    const provisionTenant = vi.fn().mockResolvedValue({
      tenantId: 'tenant-1',
      adminUserId: 'user-1',
      businessName: baseInput.businessName,
      status: 'ativo',
      idempotentHit: false,
    });
    const deps: Partial<SignupDeps> = {
      // 1ª query: tenant por slug (livre); 2ª query: e-mail em uso (livre).
      pool: makePool([[], []]),
      provisionTenant,
      uploadLogo: vi.fn(),
    };

    const before = Date.now();
    const result = await signup(baseInput, deps);
    const after = Date.now();

    expect(result.tenantId).toBe('tenant-1');
    expect(result.slug).toBe(baseInput.slug);
    expect(result.idempotentHit).toBe(false);

    // trialEndsAt ~ now + 30 dias.
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(result.trialEndsAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs);
    expect(result.trialEndsAt.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs);

    // Chamada ao provisionamento com slug como provisioningKey/instância, contato,
    // trial e menu genérico; tema com colors do preset + businessName (R6.6/R10.1).
    expect(provisionTenant).toHaveBeenCalledTimes(1);
    const arg = provisionTenant.mock.calls[0][0];
    expect(arg.provisioningKey).toBe(baseInput.slug);
    expect(arg.evolutionInstanceName).toBe(baseInput.slug);
    expect(arg.contact).toEqual({ name: baseInput.contactName, phone: '+5511999991234' });
    expect(arg.subscriptionStatus).toBe('trial');
    expect(arg.trialEndsAt).toBeInstanceOf(Date);
    expect(arg.menuPreset.categories.length).toBeGreaterThan(0);
    expect(arg.theme.businessName).toBe(baseInput.businessName);
    expect(arg.theme.colors.primary).toBeDefined();
  });

  it('faz upload da logo e repassa a Logo_Public_Url como logoUrl (R7/R8)', async () => {
    const provisionTenant = vi.fn().mockResolvedValue({
      tenantId: 'tenant-2',
      adminUserId: 'u',
      businessName: baseInput.businessName,
      status: 'ativo',
      idempotentHit: false,
    });
    const uploadLogo = vi.fn().mockResolvedValue({
      objectKey: 'tenant-assets/restaurante-teste/logo.png',
      publicUrl: 'https://foodtruck.app.br/tenant-assets/restaurante-teste/logo.png',
    });
    const deps: Partial<SignupDeps> = {
      pool: makePool([[], []]),
      provisionTenant,
      uploadLogo,
    };

    await signup(
      { ...baseInput, logo: { body: Buffer.from([1, 2, 3]), contentType: 'image/png' } },
      deps,
    );

    expect(uploadLogo).toHaveBeenCalledTimes(1);
    expect(provisionTenant.mock.calls[0][0].logoUrl).toBe(
      'https://foodtruck.app.br/tenant-assets/restaurante-teste/logo.png',
    );
  });

  it('não faz upload nem associa logo quando ausente (R7.2)', async () => {
    const provisionTenant = vi.fn().mockResolvedValue({
      tenantId: 't', adminUserId: 'u', businessName: 'b', status: 'ativo', idempotentHit: false,
    });
    const uploadLogo = vi.fn();
    const deps: Partial<SignupDeps> = { pool: makePool([[], []]), provisionTenant, uploadLogo };

    await signup(baseInput, deps);

    expect(uploadLogo).not.toHaveBeenCalled();
    expect(provisionTenant.mock.calls[0][0].logoUrl).toBeNull();
  });

  it('rejeita e-mail já em uso com 409 CONFLICT quando o slug está livre (R3.7)', async () => {
    const deps: Partial<SignupDeps> = {
      // slug livre; e-mail em uso (1 linha).
      pool: makePool([[], [{ id: 'existing-user' }]]),
      provisionTenant: vi.fn(),
      uploadLogo: vi.fn(),
    };

    await expect(signup(baseInput, deps)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    expect(deps.provisionTenant).not.toHaveBeenCalled();
    expect(deps.uploadLogo).not.toHaveBeenCalled();
  });

  it('rejeita slug usado por outro tenant (e-mail de admin diferente) com 409 CONFLICT (R5.4)', async () => {
    const deps: Partial<SignupDeps> = {
      // 1ª query: tenant existente para o slug; 2ª query: admin com OUTRO e-mail.
      pool: makePool([
        [{ id: 'other-tenant', trial_ends_at: '2099-01-01T00:00:00Z' }],
        [{ email: 'outro-dono@empresa.com' }],
      ]),
      provisionTenant: vi.fn(),
      uploadLogo: vi.fn(),
    };

    await expect(signup(baseInput, deps)).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    expect(deps.provisionTenant).not.toHaveBeenCalled();
  });

  it('trata reenvio idempotente (mesmo slug + mesmo admin) preservando o trial (R10.4/R11.3)', async () => {
    const existingTrial = '2099-06-15T12:00:00.000Z';
    const provisionTenant = vi.fn().mockResolvedValue({
      tenantId: 'tenant-existente',
      adminUserId: 'u',
      businessName: baseInput.businessName,
      status: 'ativo',
      idempotentHit: true,
    });
    const deps: Partial<SignupDeps> = {
      pool: makePool([
        [{ id: 'tenant-existente', trial_ends_at: existingTrial }],
        [{ email: baseInput.adminEmail.toUpperCase() }], // mesmo e-mail, caixa diferente
      ]),
      provisionTenant,
      uploadLogo: vi.fn(),
    };

    const result = await signup(baseInput, deps);

    expect(result.idempotentHit).toBe(true);
    expect(result.tenantId).toBe('tenant-existente');
    // Preserva o trial_ends_at já registrado, sem reiniciá-lo (R11.3).
    expect(result.trialEndsAt.toISOString()).toBe(existingTrial);
    expect(provisionTenant).toHaveBeenCalledTimes(1);
    // Reenvio idempotente não deve refazer upload de logo.
    expect(deps.uploadLogo).not.toHaveBeenCalled();
  });

  it('mapeia ProvisioningValidationError para 422 VALIDATION_ERROR (R10.2)', async () => {
    const provisionTenant = vi.fn().mockRejectedValue(new ProvisioningValidationError(['admin.email']));
    const deps: Partial<SignupDeps> = {
      pool: makePool([[], []]),
      provisionTenant,
      uploadLogo: vi.fn(),
    };

    await expect(signup(baseInput, deps)).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
    });
  });

  it('mapeia ProvisioningError para 500 PROVISIONING_FAILED sem vazar detalhes (R10.3)', async () => {
    const provisionTenant = vi.fn().mockRejectedValue(new ProvisioningError('detalhe interno sensível'));
    const deps: Partial<SignupDeps> = {
      pool: makePool([[], []]),
      provisionTenant,
      uploadLogo: vi.fn(),
    };

    const err = await signup(baseInput, deps).catch((e) => e as ServiceError);
    expect(err).toBeInstanceOf(ServiceError);
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('PROVISIONING_FAILED');
    expect(err.message).not.toContain('detalhe interno sensível');
  });
});
