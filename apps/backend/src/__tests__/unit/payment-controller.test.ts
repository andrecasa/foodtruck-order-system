import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

// Mock supabaseAdmin
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

const mockBroadcast = vi.fn().mockResolvedValue(undefined);

vi.mock('../../config/realtime.js', () => ({
  broadcast: (...args: any[]) => mockBroadcast(...args),
  tenantChannel: (base: string, tenantId: string) => `${base}:${tenantId}`,
  REALTIME_CHANNEL_QUEUE: 'orders:queue',
  REALTIME_CHANNEL_PAYMENT: 'orders:payment',
}));

// Mock pg Pool. The tenant-scoped registerPayment reads/updates through the
// TenantRepository, which issues plain pool.query() calls (no transaction):
//   1) findOne  → SELECT * FROM orders WHERE tenant_id = $1 AND (id = $2)
//   2) update   → UPDATE orders SET ... WHERE tenant_id = $n AND (id = $m)
//   3) findOne  → SELECT * FROM orders (re-fetch the updated row)
const mockQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

// Mock date-fns-tz
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2024-06-15T10:00:00')),
  format: vi.fn().mockReturnValue('2024-06-15'),
}));

import { registerPayment } from '../../controllers/order.controller.js';

function mockRequest(params?: any, body?: any): Partial<AuthenticatedRequest> {
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

const baseOrder = {
  id: 'order-uuid-1',
  daily_number: 5,
  customer_name: 'João Silva',
  origin: 'presencial',
  status: 'aguardando',
  payment_status: 'pendente',
  payment_method: null,
  total_amount_cents: 1800,
  order_date: '2024-06-15',
  created_at: '2024-06-15T13:00:00.000Z',
  started_at: null,
  ready_at: null,
  delivered_at: null,
  paid_at: null,
};

describe('Order Controller - registerPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Successful payment registration', () => {
    it('should register payment with dinheiro and return 200', async () => {
      // findOne (pendente) → update → findOne (paid)
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'dinheiro',
          paid_at: '2024-06-15T14:00:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'dinheiro' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('pago');
      expect(res.body.paymentMethod).toBe('dinheiro');
      expect(res.body.paidAt).toBe('2024-06-15T14:00:00.000Z');
    });

    it('should register payment with pix and return 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'pix',
          paid_at: '2024-06-15T14:00:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'pix' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('pago');
      expect(res.body.paymentMethod).toBe('pix');
    });

    it('should register payment with cartão and return 200', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'cartão',
          paid_at: '2024-06-15T14:00:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'cartão' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('pago');
      expect(res.body.paymentMethod).toBe('cartão');
    });

    it('should update payment_status, payment_method and paid_at in the database', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'pix',
          paid_at: '2024-06-15T14:00:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'pix' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      // Verify the UPDATE query (call index 1: findOne, update, findOne).
      // The TenantRepository composes: SET payment_status, payment_method, paid_at
      // then tenant_id, then the where-fragment (id). So params are
      // ['pago', 'pix', <paidAt>, <tenantId>, 'order-uuid-1'].
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall![0]).toContain('payment_status');
      expect(updateCall![0]).toContain('payment_method');
      expect(updateCall![0]).toContain('paid_at');
      expect(updateCall![0]).toContain('tenant_id');
      expect(updateCall![1]).toContain('pix');
      expect(updateCall![1]).toContain('order-uuid-1');
      expect(updateCall![1]).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    });
  });

  describe('Duplicate payment rejection (HTTP 409)', () => {
    it('should reject payment for already paid order with 409', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'dinheiro',
          paid_at: '2024-06-15T13:30:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'pix' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('Pedido já foi pago');
    });
  });

  describe('Invalid payment method (HTTP 422)', () => {
    it('should reject invalid payment method with 422', async () => {
      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'cheque' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Forma de pagamento inválida');
    });

    it('should reject missing payment method with 422', async () => {
      const req = mockRequest({ id: 'order-uuid-1' }, {});
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Forma de pagamento inválida');
    });

    it('should reject empty string payment method with 422', async () => {
      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: '' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Forma de pagamento inválida');
    });
  });

  describe('Order not found (HTTP 404)', () => {
    it('should return 404 when order does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ id: 'non-existent-id' }, { paymentMethod: 'pix' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('Pedido não encontrado');
    });
  });

  describe('Realtime event publishing', () => {
    it('should publish payment_registered event to the tenant-namespaced orders:payment channel on success', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'dinheiro',
          paid_at: '2024-06-15T14:00:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'dinheiro' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(mockBroadcast).toHaveBeenCalledWith('orders:payment:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'payment_registered', expect.objectContaining({
        id: 'order-uuid-1',
        paymentStatus: 'pago',
        paymentMethod: 'dinheiro',
      }));
    });

    it('should still return 200 even if Realtime publish fails', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          payment_status: 'pago',
          payment_method: 'pix',
          paid_at: '2024-06-15T14:00:00.000Z',
        }],
      });
      mockBroadcast.mockRejectedValueOnce(new Error('Realtime error'));

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'pix' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.paymentStatus).toBe('pago');
    });
  });

  describe('Internal server error', () => {
    it('should return 500 when database connection fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const req = mockRequest({ id: 'order-uuid-1' }, { paymentMethod: 'dinheiro' });
      const res = mockResponse();

      await registerPayment(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });
});
