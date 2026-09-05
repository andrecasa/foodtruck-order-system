import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

// Mock supabaseAdmin
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {},
}));

const mockBroadcast = vi.fn().mockResolvedValue(undefined);

vi.mock('../../config/realtime.js', () => ({
  broadcast: (...args: any[]) => mockBroadcast(...args),
  tenantChannel: (base: string, tenantId: string) => `${base}:${tenantId}`,
  REALTIME_CHANNEL_QUEUE: 'orders:queue',
  REALTIME_CHANNEL_PAYMENT: 'orders:payment',
}));

// Mock pg Pool
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    connect: () => mockConnect(),
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}));

// Mock date-fns-tz
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2024-06-15T10:00:00')),
  format: vi.fn().mockReturnValue('2024-06-15'),
}));

import { updateOrderItems } from '../../controllers/order.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(body?: any, params?: any): Partial<AuthenticatedRequest> {
  return {
    body: body || {},
    params: params || {},
    user: { id: 'user-1', email: 'test@test.com' },
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

describe('Order Controller - updateOrderItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const validBody = {
    items: [
      { menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 2 },
      { menuItemId: '22222222-2222-2222-2222-222222222222', quantity: 1 },
    ],
  };

  const mockOrder = {
    id: orderId,
    daily_number: 5,
    customer_name: 'João Silva',
    origin: 'presencial',
    status: 'aguardando',
    payment_status: 'pendente',
    payment_method: null,
    total_amount_cents: 1000,
    order_date: '2024-06-15',
    created_at: '2024-06-15T13:00:00.000Z',
    started_at: null,
    ready_at: null,
    delivered_at: null,
    paid_at: null,
  };

  const mockMenuItems = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Pastel de Carne', price_cents: 750, status: 'ativo' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Água Mineral', price_cents: 300, status: 'ativo' },
  ];

  function setupOrderLookup(order = mockOrder) {
    mockPoolQuery.mockResolvedValueOnce({ rows: [order] });
  }

  function setupMenuLookup(items = mockMenuItems) {
    mockPoolQuery.mockResolvedValueOnce({ rows: items });
  }

  function setupSuccessfulTransaction() {
    // BEGIN
    mockQuery.mockResolvedValueOnce(undefined);
    // DELETE old order_items
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT order_item 1
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'item-uuid-1',
        order_id: orderId,
        menu_item_id: '11111111-1111-1111-1111-111111111111',
        item_name: 'Pastel de Carne',
        unit_price_cents: 750,
        quantity: 2,
      }],
    });
    // INSERT order_item 2
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'item-uuid-2',
        order_id: orderId,
        menu_item_id: '22222222-2222-2222-2222-222222222222',
        item_name: 'Água Mineral',
        unit_price_cents: 300,
        quantity: 1,
      }],
    });
    // UPDATE orders.total_amount_cents
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // COMMIT
    mockQuery.mockResolvedValueOnce(undefined);
  }

  describe('Successful update', () => {
    it('should update order items and return 200 with full order', async () => {
      setupOrderLookup();
      setupMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe(orderId);
      expect(res.body.dailyNumber).toBe(5);
      expect(res.body.customerName).toBe('João Silva');
      expect(res.body.origin).toBe('presencial');
      expect(res.body.status).toBe('aguardando');
      expect(res.body.paymentStatus).toBe('pendente');
      expect(res.body.items).toHaveLength(2);
    });

    it('should calculate total correctly as sum of (price × quantity)', async () => {
      setupOrderLookup();
      setupMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      // 750 * 2 + 300 * 1 = 1800
      expect(res.body.totalAmountCents).toBe(1800);
    });

    it('should snapshot item name and price from current menu items', async () => {
      setupOrderLookup();
      setupMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.items[0].itemName).toBe('Pastel de Carne');
      expect(res.body.items[0].unitPriceCents).toBe(750);
      expect(res.body.items[1].itemName).toBe('Água Mineral');
      expect(res.body.items[1].unitPriceCents).toBe(300);
    });

    it('should broadcast order_updated event on the tenant-namespaced orders:queue channel', async () => {
      setupOrderLookup();
      setupMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(mockBroadcast).toHaveBeenCalledWith('orders:queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'order_updated', expect.objectContaining({
        id: orderId,
        totalAmountCents: 1800,
        items: expect.arrayContaining([
          expect.objectContaining({ menuItemId: '11111111-1111-1111-1111-111111111111' }),
        ]),
      }));
    });

    it('should still return 200 when realtime broadcast fails', async () => {
      setupOrderLookup();
      setupMenuLookup();
      setupSuccessfulTransaction();
      mockBroadcast.mockRejectedValueOnce(new Error('Realtime unavailable'));

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Order not found (404)', () => {
    it('should return 404 when order does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Pedido não encontrado');
    });
  });

  describe('Payment guard (422)', () => {
    it('should return 422 when order is already paid (aguardando)', async () => {
      setupOrderLookup({ ...mockOrder, status: 'aguardando', payment_status: 'pago', paid_at: '2024-06-15T13:05:00.000Z' });

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Pedido não pode ser editado após o pagamento');
    });

    it('should return 422 when order is already paid (preparando)', async () => {
      setupOrderLookup({ ...mockOrder, status: 'preparando', payment_status: 'pago', paid_at: '2024-06-15T13:05:00.000Z' });

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Pedido não pode ser editado após o pagamento');
    });

    it('should return 422 when order is already paid (entregue)', async () => {
      setupOrderLookup({ ...mockOrder, status: 'entregue', payment_status: 'pago', paid_at: '2024-06-15T13:05:00.000Z' });

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Pedido não pode ser editado após o pagamento');
    });

    it('should allow editing when order is preparando but not paid', async () => {
      setupOrderLookup({ ...mockOrder, status: 'preparando', payment_status: 'pendente' });
      setupMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
    });

    it('should allow editing when order is pronto but not paid', async () => {
      setupOrderLookup({ ...mockOrder, status: 'pronto', payment_status: 'pendente' });
      setupMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
    });
  });

  describe('Validation errors (422)', () => {
    it('should return 422 when items array is empty', async () => {
      const req = mockRequest({ items: [] }, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('A lista deve conter entre 1 e 50 itens');
    });

    it('should return 422 when duplicate menuItemIds are present', async () => {
      const req = mockRequest({
        items: [
          { menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 1 },
          { menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 2 },
        ],
      }, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Itens duplicados não são permitidos');
    });
  });

  describe('Menu item validation (422)', () => {
    it('should return 422 when a menu item does not exist', async () => {
      setupOrderLookup();
      // Only one item found
      mockPoolQuery.mockResolvedValueOnce({ rows: [mockMenuItems[0]] });

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Item não encontrado ou inativo');
    });

    it('should return 422 when a menu item is inactive', async () => {
      setupOrderLookup();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          mockMenuItems[0],
          { ...mockMenuItems[1], status: 'inativo' },
        ],
      });

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Item não encontrado ou inativo');
    });
  });

  describe('Transaction failure (500)', () => {
    it('should return 500 and rollback on database error during transaction', async () => {
      setupOrderLookup();
      setupMenuLookup();

      // BEGIN
      mockQuery.mockResolvedValueOnce(undefined);
      // DELETE throws
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));
      // ROLLBACK
      mockQuery.mockResolvedValueOnce(undefined);

      const req = mockRequest(validBody, { id: orderId });
      const res = mockResponse();

      await invokeHandler(updateOrderItems, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
      // Mensagem genérica única do error middleware (não mais fallback por-endpoint).
      expect(res.body.message).toBe('Erro ao processar requisição');
    });
  });
});
