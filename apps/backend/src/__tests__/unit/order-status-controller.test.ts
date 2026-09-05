import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
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

// Mock pg Pool. The tenant-scoped updateOrderStatus reads/updates through the
// TenantRepository, which issues plain pool.query() calls (no transaction):
//   1) findOne → SELECT * FROM orders WHERE tenant_id = $1 AND (id = $2)
//   2) update  → UPDATE orders SET status = $1, <ts> = $2 WHERE tenant_id = $3 AND (id = $4)
//   3) findOne → SELECT * FROM orders (re-fetch the updated row)
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

import { updateOrderStatus } from '../../controllers/order.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

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
  total_amount_cents: 1800,
  order_date: '2024-06-15',
  created_at: '2024-06-15T13:00:00.000Z',
  started_at: null,
  ready_at: null,
  delivered_at: null,
};

describe('Order Controller - updateOrderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Valid transitions', () => {
    it('should transition aguardando → preparando and set started_at', async () => {
      // findOne (current order)
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder, status: 'aguardando' }] });
      // UPDATE order (repo.update reads rowCount)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // findOne (re-fetch updated order)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'preparando',
          started_at: '2024-06-15T13:05:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'preparando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('preparando');
      expect(res.body.startedAt).toBe('2024-06-15T13:05:00.000Z');

      // Verify the UPDATE query sets started_at
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall![0]).toContain('started_at');
      expect(updateCall![1][0]).toBe('preparando');
    });

    it('should transition preparando → pronto and set ready_at', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseOrder, status: 'preparando', started_at: '2024-06-15T13:05:00.000Z' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'pronto',
          started_at: '2024-06-15T13:05:00.000Z',
          ready_at: '2024-06-15T13:15:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'pronto' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('pronto');
      expect(res.body.readyAt).toBe('2024-06-15T13:15:00.000Z');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall![0]).toContain('ready_at');
      expect(updateCall![1][0]).toBe('pronto');
    });

    it('should transition pronto → entregue and set delivered_at', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'pronto',
          started_at: '2024-06-15T13:05:00.000Z',
          ready_at: '2024-06-15T13:15:00.000Z',
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'entregue',
          started_at: '2024-06-15T13:05:00.000Z',
          ready_at: '2024-06-15T13:15:00.000Z',
          delivered_at: '2024-06-15T13:20:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'entregue' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('entregue');
      expect(res.body.deliveredAt).toBe('2024-06-15T13:20:00.000Z');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall![0]).toContain('delivered_at');
      expect(updateCall![1][0]).toBe('entregue');
    });
  });

  describe('Invalid transitions (HTTP 422)', () => {
    it('should reject aguardando → pronto (skipping preparando)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder, status: 'aguardando' }] });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'pronto' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Transição de status inválida');
    });

    it('should reject aguardando → entregue (skipping steps)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder, status: 'aguardando' }] });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'entregue' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Transição de status inválida');
    });

    it('should reject pronto → preparando (backward transition)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseOrder, status: 'pronto', started_at: '2024-06-15T13:05:00.000Z', ready_at: '2024-06-15T13:15:00.000Z' }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'preparando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Transição de status inválida');
    });

    it('should reject entregue → any status (final state)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'entregue',
          started_at: '2024-06-15T13:05:00.000Z',
          ready_at: '2024-06-15T13:15:00.000Z',
          delivered_at: '2024-06-15T13:20:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'aguardando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Transição de status inválida');
    });

    it('should reject same-status transition (aguardando → aguardando)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder, status: 'aguardando' }] });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'aguardando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Transição de status inválida');
    });
  });

  describe('Order not found (HTTP 404)', () => {
    it('should return 404 when order does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ id: 'non-existent-id' }, { status: 'preparando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.message).toBe('Pedido não encontrado');
    });
  });

  describe('Zod validation failure', () => {
    it('should reject invalid status value', async () => {
      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'cancelado' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing status field', async () => {
      const req = mockRequest({ id: 'order-uuid-1' }, {});
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Realtime event publishing', () => {
    it('should publish status_updated event to the tenant-namespaced orders:queue channel on success', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder, status: 'aguardando' }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'preparando',
          started_at: '2024-06-15T13:05:00.000Z',
        }],
      });

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'preparando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(mockBroadcast).toHaveBeenCalledWith('orders:queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'status_updated', expect.objectContaining({
        id: 'order-uuid-1',
        status: 'preparando',
      }));
    });

    it('should still return 200 even if Realtime publish fails', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseOrder, status: 'aguardando' }] });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseOrder,
          status: 'preparando',
          started_at: '2024-06-15T13:05:00.000Z',
        }],
      });
      mockBroadcast.mockRejectedValueOnce(new Error('Realtime error'));

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'preparando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('preparando');
    });
  });

  describe('Internal server error', () => {
    it('should return 500 when database connection fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const req = mockRequest({ id: 'order-uuid-1' }, { status: 'preparando' });
      const res = mockResponse();

      await invokeHandler(updateOrderStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });
});
