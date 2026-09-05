import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
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

// Mock pg Pool - the controller uses pool.query for menu lookups and pool.connect for transactions
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

import { createOrder } from '../../controllers/order.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(body?: any): Partial<AuthenticatedRequest> {
  return {
    body: body || {},
    params: {},
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

describe('Order Controller - createOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default pg client mock (for transactions via pool.connect)
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  const validOrderBody = {
    customerName: 'João Silva',
    origin: 'presencial' as const,
    items: [
      { menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 2 },
      { menuItemId: '22222222-2222-2222-2222-222222222222', quantity: 1 },
    ],
  };

  const mockMenuItems = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Pastel de Carne', price_cents: 750, status: 'ativo' },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Água Mineral', price_cents: 300, status: 'ativo' },
  ];

  function setupSuccessfulMenuLookup() {
    // The controller uses pool.query for menu item lookup
    mockPoolQuery.mockResolvedValueOnce({ rows: mockMenuItems });
  }

  function setupSuccessfulTransaction() {
    // BEGIN
    mockQuery.mockResolvedValueOnce(undefined);
    // next_daily_number
    mockQuery.mockResolvedValueOnce({ rows: [{ daily_number: 5 }] });
    // INSERT order
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'order-uuid-1',
        daily_number: 5,
        customer_name: 'João Silva',
        origin: 'presencial',
        status: 'aguardando',
        payment_status: 'pendente',
        total_amount_cents: 1800,
        order_date: '2024-06-15',
        created_at: '2024-06-15T13:00:00.000Z',
      }],
    });
    // INSERT order_item 1
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'item-uuid-1',
        order_id: 'order-uuid-1',
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
        order_id: 'order-uuid-1',
        menu_item_id: '22222222-2222-2222-2222-222222222222',
        item_name: 'Água Mineral',
        unit_price_cents: 300,
        quantity: 1,
      }],
    });
    // COMMIT
    mockQuery.mockResolvedValueOnce(undefined);
  }

  describe('Successful order creation', () => {
    it('should create an order successfully with valid data and return 201', async () => {
      setupSuccessfulMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe('order-uuid-1');
      expect(res.body.dailyNumber).toBe(5);
      expect(res.body.customerName).toBe('João Silva');
      expect(res.body.origin).toBe('presencial');
      expect(res.body.status).toBe('aguardando');
      expect(res.body.paymentStatus).toBe('pendente');
      expect(res.body.items).toHaveLength(2);
    });

    it('should calculate total correctly as sum of (price × quantity)', async () => {
      setupSuccessfulMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      // 750 * 2 + 300 * 1 = 1800
      expect(res.body.totalAmountCents).toBe(1800);
    });

    it('should snapshot item name and price from menu items', async () => {
      setupSuccessfulMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body.items[0].itemName).toBe('Pastel de Carne');
      expect(res.body.items[0].unitPriceCents).toBe(750);
      expect(res.body.items[1].itemName).toBe('Água Mineral');
      expect(res.body.items[1].unitPriceCents).toBe(300);
    });

    it('should publish new_order event to Realtime after successful creation', async () => {
      setupSuccessfulMenuLookup();
      setupSuccessfulTransaction();

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(mockBroadcast).toHaveBeenCalledWith('orders:queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'new_order', expect.objectContaining({
        id: 'order-uuid-1',
        dailyNumber: 5,
      }));
    });
  });

  describe('Zod validation failures', () => {
    it('should reject when customerName is missing', async () => {
      const req = mockRequest({
        origin: 'presencial',
        items: [{ menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
      });
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject when items array is empty', async () => {
      const req = mockRequest({
        customerName: 'João',
        origin: 'presencial',
        items: [],
      });
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject when items is missing', async () => {
      const req = mockRequest({
        customerName: 'João',
        origin: 'presencial',
      });
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Invalid origin (HTTP 422)', () => {
    it('should reject invalid origin value', async () => {
      const req = mockRequest({
        customerName: 'João',
        origin: 'telefone',
        items: [{ menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
      });
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Origem inválida');
    });
  });

  describe('Menu item validation (HTTP 422)', () => {
    it('should reject when a menu item does not exist', async () => {
      // Only one item found, second doesn't exist
      mockPoolQuery.mockResolvedValueOnce({
        rows: [mockMenuItems[0]],
      });

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Item não encontrado ou inativo');
    });

    it('should reject when a menu item is inactive', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [
          mockMenuItems[0],
          { ...mockMenuItems[1], status: 'inativo' },
        ],
      });

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Item não encontrado ou inativo');
    });
  });

  describe('Daily number conflict (HTTP 409)', () => {
    it('should return 409 when daily_number unique constraint is violated', async () => {
      setupSuccessfulMenuLookup();

      // BEGIN
      mockQuery.mockResolvedValueOnce(undefined);
      // next_daily_number
      mockQuery.mockResolvedValueOnce({ rows: [{ daily_number: 5 }] });
      // INSERT order - unique constraint violation
      const constraintError: any = new Error('duplicate key value');
      constraintError.code = '23505';
      constraintError.constraint = 'idx_orders_daily_number';
      mockQuery.mockRejectedValueOnce(constraintError);
      // ROLLBACK
      mockQuery.mockResolvedValueOnce(undefined);

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('Conflito de numeração, tente novamente');
    });
  });

  describe('Total calculation', () => {
    it('should correctly compute total for single item order', async () => {
      const singleItemBody = {
        customerName: 'Maria',
        origin: 'whatsapp' as const,
        items: [{ menuItemId: '11111111-1111-1111-1111-111111111111', quantity: 3 }],
      };

      // Menu item lookup via pool.query
      mockPoolQuery.mockResolvedValueOnce({
        rows: [mockMenuItems[0]],
      });

      // BEGIN
      mockQuery.mockResolvedValueOnce(undefined);
      // next_daily_number
      mockQuery.mockResolvedValueOnce({ rows: [{ daily_number: 1 }] });
      // INSERT order - total should be 750 * 3 = 2250
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'order-uuid-2',
          daily_number: 1,
          customer_name: 'Maria',
          origin: 'whatsapp',
          status: 'aguardando',
          payment_status: 'pendente',
          total_amount_cents: 2250,
          order_date: '2024-06-15',
          created_at: '2024-06-15T13:00:00.000Z',
        }],
      });
      // INSERT order_item
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'item-uuid-3',
          order_id: 'order-uuid-2',
          menu_item_id: '11111111-1111-1111-1111-111111111111',
          item_name: 'Pastel de Carne',
          unit_price_cents: 750,
          quantity: 3,
        }],
      });
      // COMMIT
      mockQuery.mockResolvedValueOnce(undefined);

      const req = mockRequest(singleItemBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      // Verify the total passed to the ORDER INSERT query. Via the
      // TenantRepository the INSERT columns/params are composed dynamically
      // (including the injected tenant_id), so assert the total is among the
      // insert params rather than at a fixed positional index.
      const insertOrderCall = mockQuery.mock.calls[2]; // 3rd client call is ORDER INSERT
      expect(insertOrderCall).toBeDefined();
      expect(insertOrderCall![0]).toContain('INSERT INTO orders');
      expect(insertOrderCall![1]).toContain(2250); // total_amount_cents
      expect(insertOrderCall![1]).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'); // tenant_id injected
    });
  });

  describe('Transaction rollback', () => {
    it('should rollback transaction on unexpected error', async () => {
      setupSuccessfulMenuLookup();

      // BEGIN
      mockQuery.mockResolvedValueOnce(undefined);
      // next_daily_number throws
      mockQuery.mockRejectedValueOnce(new Error('unexpected DB error'));
      // ROLLBACK
      mockQuery.mockResolvedValueOnce(undefined);

      const req = mockRequest(validOrderBody);
      const res = mockResponse();

      await invokeHandler(createOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });
});
