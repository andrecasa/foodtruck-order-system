import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';

/**
 * Unit tests for the public (unauthenticated) branding + menu controllers
 * (customer-ordering Task 4).
 *
 * These cover the response contract only — the 400 (invalid slug) / 404
 * (unknown tenant) paths are enforced by `publicTenantMiddleware` and are
 * covered in `public-tenant-middleware.test.ts`. Here the tenant is assumed
 * already resolved (req.tenantId set).
 *
 * **Validates: Requirements 2.4, 5.2, 5.3**
 */

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../services/menu.service.js', () => ({
  getMenu: vi.fn(),
}));

vi.mock('../../services/order.service.js', () => ({
  getOrderById: vi.fn(),
  createOrder: vi.fn(),
}));

// The `@order-system/shared` barrel resolves `publicCreateOrderSchema` as
// `undefined` under Vitest (a re-export quirk specific to this validator file;
// it works fine at runtime via tsx). Re-provide the barrel with the real schema
// pulled directly from its module so the create-order controller can validate.
vi.mock('@order-system/shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@order-system/shared');
  const { publicCreateOrderSchema } = await vi.importActual<Record<string, unknown>>(
    '@order-system/shared/validators/public-order.validator',
  );
  return { ...actual, publicCreateOrderSchema };
});

import { pool } from '../../config/database.js';
import * as menuService from '../../services/menu.service.js';
import * as orderService from '../../services/order.service.js';
import {
  publicBrandingController,
  publicMenuController,
  publicOrderStatusController,
  publicCreateOrderController,
} from '../../controllers/public.controller.js';
import type { PublicTenantRequest } from '../../middleware/public-tenant.middleware.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

function mockRequest(): Partial<PublicTenantRequest> {
  return { tenantId: TENANT, tenantSlug: 'pastel-das-meninas', params: { slug: 'pastel-das-meninas' } };
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

function queryResult(rows: any[]) {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] } as never;
}

describe('Public Branding Controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns public branding with a fully-merged theme and a pre-built realtime channel', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          business_name: 'Pastel das Meninas',
          logo_url: 'https://cdn/logo.png',
          // Partial tenant override — only the primary color is customized.
          theme: { colors: { primary: '#7B2D2D' } },
          provisioning_key: 'pastel-das-meninas',
        },
      ]),
    );

    const req = mockRequest();
    const res = mockResponse();

    await publicBrandingController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.businessName).toBe('Pastel das Meninas');
    expect(res.body.logoUrl).toBe('https://cdn/logo.png');
    expect(res.body.slug).toBe('pastel-das-meninas');
    expect(res.body.realtimeChannel).toBe(`orders:queue:${TENANT}`);

    // Theme is the tenant override merged over the neutral platform theme:
    // primary is customized, other tokens fall back to platform values, and
    // non-color sections (typography/spacing) are present — same contract as
    // the authenticated branding endpoint.
    expect(res.body.theme.colors.primary).toBe('#7B2D2D');
    expect(res.body.theme.colors.background).toBe('#F5F6F7');
    expect(res.body.theme.typography).toBeDefined();
    expect(res.body.theme.spacing).toBeDefined();

    // Must not select or expose the raw UUID / evolution / whatsapp fields (R5.3).
    const [sql] = vi.mocked(pool.query).mock.calls[0];
    expect(sql).toContain('business_name');
    expect(sql).toContain('provisioning_key');
    expect(sql).not.toContain('evolution_instance_name');
    expect(sql).not.toContain('whatsapp_config');
    expect(res.body).not.toHaveProperty('id');
    // The query is by tenant id resolved upstream by the middleware.
    expect(vi.mocked(pool.query).mock.calls[0][1]).toEqual([TENANT]);
  });

  it('falls back to the neutral platform theme when the tenant theme is null', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          business_name: 'Loja X',
          logo_url: null,
          theme: null,
          provisioning_key: 'loja-x',
        },
      ]),
    );

    const req = mockRequest();
    const res = mockResponse();

    await publicBrandingController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    // Null override → full neutral platform theme.
    expect(res.body.theme.colors.primary).toBe('#3B5568');
    expect(res.body.theme.colors.surface).toBe('#FFFFFF');
  });

  it('returns 500 when the branding query throws', async () => {
    vi.mocked(pool.query).mockRejectedValueOnce(new Error('db down'));

    const req = mockRequest();
    const res = mockResponse();

    await publicBrandingController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});

describe('Public Menu Controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reuses getMenu(tenantId, false) and maps to the public DTO', async () => {
    vi.mocked(menuService.getMenu).mockResolvedValueOnce([
      {
        category: 'Pastéis',
        sortOrder: 1,
        items: [
          {
            id: 'i1',
            name: 'Pastel de Carne',
            price: 800,
            category: 'Pastéis',
            status: 'ativo',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-02',
          },
        ],
      },
    ]);

    const req = mockRequest();
    const res = mockResponse();

    await publicMenuController(req as PublicTenantRequest, res as unknown as Response);

    // Uses the SAME service as the authenticated endpoint, showAll = false.
    expect(menuService.getMenu).toHaveBeenCalledWith(TENANT, false);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([
      {
        name: 'Pastéis',
        sortOrder: 1,
        items: [
          { id: 'i1', name: 'Pastel de Carne', priceCents: 800, categoryName: 'Pastéis' },
        ],
      },
    ]);

    // price -> priceCents; internal fields dropped; no description field.
    const item = res.body[0].items[0];
    expect(item).not.toHaveProperty('price');
    expect(item).not.toHaveProperty('status');
    expect(item).not.toHaveProperty('createdAt');
    expect(item).not.toHaveProperty('updatedAt');
    expect(item).not.toHaveProperty('description');
  });

  it('returns 500 when getMenu throws', async () => {
    vi.mocked(menuService.getMenu).mockRejectedValueOnce(new Error('boom'));

    const req = mockRequest();
    const res = mockResponse();

    await publicMenuController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});

/**
 * Unit tests for the public order-status controller (customer-ordering Task 6).
 *
 * **Validates: Requirements 4.2, 4.3, 4.4**
 */
function orderStatusRequest(orderId: string): Partial<PublicTenantRequest> {
  return {
    tenantId: TENANT,
    tenantSlug: 'pastel-das-meninas',
    params: { slug: 'pastel-das-meninas', orderId },
  };
}

describe('Public Order Status Controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only the customer-facing fields for an existing order', async () => {
    vi.mocked(orderService.getOrderById).mockResolvedValueOnce({
      id: 'order-1',
      dailyNumber: 7,
      customerName: 'Ana',
      origin: 'web',
      status: 'preparando',
      paymentStatus: 'pendente',
      paymentMethod: null,
      totalAmountCents: 1600,
      orderDate: '2024-01-01',
      createdAt: '2024-01-01T10:00:00.000Z',
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      paidAt: null,
      items: [
        {
          id: 'oi-1',
          menuItemId: 'mi-1',
          itemName: 'Pastel de Carne',
          unitPriceCents: 800,
          quantity: 2,
        },
      ],
    });

    const req = orderStatusRequest('order-1');
    const res = mockResponse();

    await publicOrderStatusController(req as PublicTenantRequest, res as unknown as Response);

    // Scoped to the resolved tenant.
    expect(orderService.getOrderById).toHaveBeenCalledWith(TENANT, 'order-1');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      id: 'order-1',
      dailyNumber: 7,
      customerName: 'Ana',
      status: 'preparando',
      // paymentStatus IS exposed so the customer can see if the order is paid.
      paymentStatus: 'pendente',
      // origin IS exposed so the order card can show an origin badge.
      origin: 'web',
      totalAmountCents: 1600,
      createdAt: '2024-01-01T10:00:00.000Z',
      items: [{ itemName: 'Pastel de Carne', quantity: 2, unitPriceCents: 800 }],
    });

    // Must NOT expose truly internal fields. `paymentStatus`/`origin` are
    // intentionally allowed (see above); `payment_method`/`created_by` hidden.
    expect(res.body).not.toHaveProperty('created_by');
    expect(res.body).not.toHaveProperty('createdBy');
    expect(res.body).not.toHaveProperty('payment_status');
    expect(res.body).not.toHaveProperty('payment_method');
    expect(res.body).not.toHaveProperty('paymentMethod');
    expect(res.body).not.toHaveProperty('orderDate');
    // Item internal ids are not leaked either.
    expect(res.body.items[0]).not.toHaveProperty('id');
    expect(res.body.items[0]).not.toHaveProperty('menuItemId');
  });

  it('maps a 404 ServiceError to 404 ORDER_NOT_FOUND (not 500)', async () => {
    // getOrderById throws a ServiceError with .statusCode === 404 when the
    // order does not exist or belongs to another tenant. The controller maps by
    // inspecting `.statusCode` (not instanceof), so a shaped error suffices.
    const notFound = Object.assign(new Error('Pedido não encontrado'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    vi.mocked(orderService.getOrderById).mockRejectedValueOnce(notFound);

    const req = orderStatusRequest('missing');
    const res = mockResponse();

    await publicOrderStatusController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'ORDER_NOT_FOUND' });
  });

  it('returns 500 for an unexpected (non-404) error', async () => {
    vi.mocked(orderService.getOrderById).mockRejectedValueOnce(new Error('db down'));

    const req = orderStatusRequest('order-1');
    const res = mockResponse();

    await publicOrderStatusController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });

  it('tolerates an order with no items', async () => {
    vi.mocked(orderService.getOrderById).mockResolvedValueOnce({
      id: 'order-2',
      dailyNumber: 8,
      customerName: 'Bruno',
      origin: 'web',
      status: 'aguardando',
      paymentStatus: 'pendente',
      paymentMethod: null,
      totalAmountCents: 0,
      orderDate: '2024-01-01',
      createdAt: '2024-01-01T11:00:00.000Z',
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      paidAt: null,
      items: undefined,
    });

    const req = orderStatusRequest('order-2');
    const res = mockResponse();

    await publicOrderStatusController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('Public Create-Order Controller', () => {
  beforeEach(() => vi.clearAllMocks());

  function createOrderRequest(body: unknown): Partial<PublicTenantRequest> {
    return { ...mockRequest(), body } as Partial<PublicTenantRequest>;
  }

  it('returns the full public order shape (customerName, paymentStatus, items) on success', async () => {
    // Admin lookup (owner of the order).
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([{ id: 'admin-1' }]));

    vi.mocked(orderService.createOrder).mockResolvedValueOnce({
      id: 'order-9',
      dailyNumber: 5,
      customerName: 'Ana Costa',
      origin: 'web',
      status: 'aguardando',
      paymentStatus: 'pendente',
      paymentMethod: null,
      totalAmountCents: 2500,
      orderDate: '2024-01-15',
      createdAt: '2024-01-15T10:00:00.000Z',
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      paidAt: null,
      items: [
        { id: 'oi-1', menuItemId: 'm1', itemName: 'Pastel de Frango', unitPriceCents: 2500, quantity: 1 },
      ],
    } as never);

    const req = createOrderRequest({
      customerName: 'Ana Costa',
      items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
    });
    const res = mockResponse();

    await publicCreateOrderController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(201);
    // The client persists this straight into "Meus Pedidos" and renders the
    // order card, so customerName, paymentStatus, origin and items must all be
    // present.
    expect(res.body).toEqual({
      id: 'order-9',
      dailyNumber: 5,
      customerName: 'Ana Costa',
      status: 'aguardando',
      paymentStatus: 'pendente',
      origin: 'web',
      totalAmountCents: 2500,
      orderDate: '2024-01-15',
      createdAt: '2024-01-15T10:00:00.000Z',
      items: [{ itemName: 'Pastel de Frango', quantity: 1, unitPriceCents: 2500 }],
    });
    // Internal-only fields stay hidden.
    expect(res.body).not.toHaveProperty('paymentMethod');
    expect(res.body).not.toHaveProperty('createdBy');
  });

  it('rejects an invalid body with 400 without touching the order service', async () => {
    const req = createOrderRequest({ customerName: '', items: [] });
    const res = mockResponse();

    await publicCreateOrderController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(400);
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });

  it('returns 422 when the tenant has no active admin to own the order', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(queryResult([]));

    const req = createOrderRequest({
      customerName: 'Ana',
      items: [{ menuItemId: '550e8400-e29b-41d4-a716-446655440000', quantity: 1 }],
    });
    const res = mockResponse();

    await publicCreateOrderController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(422);
    expect(res.body).toEqual({ error: 'TENANT_UNAVAILABLE' });
    expect(orderService.createOrder).not.toHaveBeenCalled();
  });
});
