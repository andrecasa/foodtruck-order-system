import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Testes example-based do `publicTenantMiddleware` focados na extensão do
 * Trial_Guard (R12.7/R12.8): ao resolver o tenant por slug, o middleware
 * seleciona `trial_ends_at`/`subscription_status` e bloqueia com 403
 * `ESTABLISHMENT_UNAVAILABLE` quando o teste está expirado e o tenant não
 * está convertido; caso contrário, segue para os controllers públicos.
 *
 * O `pool` é mockado para controlar a linha resolvida sem I/O real, no mesmo
 * espírito dos demais testes do backend (injeção/substituição de dependência).
 *
 * Requirements: 12.7, 12.8.
 */

const query = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => query(...args),
  },
}));

// Import após o mock para que o middleware use o `pool` mockado.
const { publicTenantMiddleware } = await import('../public-tenant.middleware.js');
const { ESTABLISHMENT_UNAVAILABLE } = await import('../../services/trial-guard.js');

/** Constrói um `res` falso que captura status/body como o Express faria. */
function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const VALID_SLUG = 'pastel-das-meninas';

/** Um instante fixo no passado, usado como fim de teste já expirado. */
const PAST = new Date('2020-01-01T00:00:00.000Z').toISOString();
/** Um instante bem no futuro, usado como teste ainda vigente. */
const FUTURE = new Date('2999-01-01T00:00:00.000Z').toISOString();

beforeEach(() => {
  query.mockReset();
});

describe('publicTenantMiddleware — Trial_Guard (R12.7/R12.8)', () => {
  it('bloqueia com 403 ESTABLISHMENT_UNAVAILABLE quando o teste expirou e não há conversão (R12.7)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1', trial_ends_at: PAST, subscription_status: 'trial' }],
    });
    const req = { params: { slug: VALID_SLUG } } as never;
    const res = makeRes();
    const next = vi.fn();

    await publicTenantMiddleware(req, res as never, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: ESTABLISHMENT_UNAVAILABLE.code,
      message: ESTABLISHMENT_UNAVAILABLE.message,
    });
    expect(next).not.toHaveBeenCalled();
    // A query deve selecionar as colunas de trial.
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain('trial_ends_at');
    expect(sql).toContain('subscription_status');
  });

  it('permite o acesso quando o tenant está convertido, mesmo com teste expirado (R12.8)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1', trial_ends_at: PAST, subscription_status: 'active' }],
    });
    const req = { params: { slug: VALID_SLUG } } as { params: { slug: string }; tenantId?: string; tenantSlug?: string };
    const res = makeRes();
    const next = vi.fn();

    await publicTenantMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
    expect(req.tenantId).toBe('tenant-1');
    expect(req.tenantSlug).toBe(VALID_SLUG);
  });

  it('permite o acesso quando o teste ainda está vigente (R12.8)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1', trial_ends_at: FUTURE, subscription_status: 'trial' }],
    });
    const req = { params: { slug: VALID_SLUG } } as never;
    const res = makeRes();
    const next = vi.fn();

    await publicTenantMiddleware(req, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('permite o acesso de tenant legado sem trial_ends_at (R12.8)', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'tenant-1', trial_ends_at: null, subscription_status: 'trial' }],
    });
    const req = { params: { slug: VALID_SLUG } } as never;
    const res = makeRes();
    const next = vi.fn();

    await publicTenantMiddleware(req, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('preserva o 404 TENANT_NOT_FOUND para slug bem-formado sem tenant ativo', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const req = { params: { slug: VALID_SLUG } } as never;
    const res = makeRes();
    const next = vi.fn();

    await publicTenantMiddleware(req, res as never, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      error: 'TENANT_NOT_FOUND',
      message: 'Estabelecimento não encontrado.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserva o 400 INVALID_SLUG_FORMAT sem tocar no banco', async () => {
    const req = { params: { slug: 'A' } } as never;
    const res = makeRes();
    const next = vi.fn();

    await publicTenantMiddleware(req, res as never, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_SLUG_FORMAT' });
    expect(query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});
