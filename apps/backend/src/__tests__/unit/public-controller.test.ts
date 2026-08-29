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
}));

import { pool } from '../../config/database.js';
import * as menuService from '../../services/menu.service.js';
import * as orderService from '../../services/order.service.js';
import {
  publicBrandingController,
  publicMenuController,
  publicOrderStatusController,
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

  it('returns only public branding fields and a pre-built realtime channel', async () => {
    vi.mocked(pool.query).mockResolvedValueOnce(
      queryResult([
        {
          business_name: 'Pastel das Meninas',
          logo_url: 'https://cdn/logo.png',
          theme: { primary: '#f00' },
          provisioning_key: 'pastel-das-meninas',
        },
      ]),
    );

    const req = mockRequest();
    const res = mockResponse();

    await publicBrandingController(req as PublicTenantRequest, res as unknown as Response);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      businessName: 'Pastel das Meninas',
      logoUrl: 'https://cdn/logo.png',
      theme: { primary: '#f00' },
      slug: 'pastel-das-meninas',
      realtimeChannel: `orders:queue:${TENANT}`,
    });

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
      totalAmountCents: 1600,
      createdAt: '2024-01-01T10:00:00.000Z',
      items: [{ itemName: 'Pastel de Carne', quantity: 2, unitPriceCents: 800 }],
    });

    // Must NOT expose truly internal fields. `paymentStatus` is intentionally
    // allowed (see above); `payment_method`/`created_by` remain hidden.
    expect(res.body).not.toHaveProperty('created_by');
    expect(res.body).not.toHaveProperty('createdBy');
    expect(res.body).not.toHaveProperty('payment_status');
    expect(res.body).not.toHaveProperty('payment_method');
    expect(res.body).not.toHaveProperty('paymentMethod');
    expect(res.body).not.toHaveProperty('origin');
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
