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
const mockPoolQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}));

// Mock date-fns-tz
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2024-06-15T10:00:00')),
  format: vi.fn().mockReturnValue('2024-06-15'),
}));

import { deleteOrder } from '../../controllers/order.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(params?: any): Partial<AuthenticatedRequest> {
  return {
    body: {},
    params: params || {},
    user: { id: 'user-1', email: 'test@test.com' },
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any; sent: boolean } {
  const res: any = {
    statusCode: 0,
    body: null,
    sent: false,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
    send() {
      res.sent = true;
      return res;
    },
  };
  return res;
}

describe('Order Controller - deleteOrder', () => {
  const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 204 when order is successfully deleted', async () => {
    // Order lookup
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: orderId, daily_number: 1, customer_name: 'João', status: 'aguardando', payment_status: 'pendente' }],
    });
    // DELETE query
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

    const req = mockRequest({ id: orderId });
    const res = mockResponse();

    await invokeHandler(deleteOrder, req as AuthenticatedRequest, res as unknown as Response);

    expect(res.statusCode).toBe(204);
    expect(res.sent).toBe(true);
  });

  it('should return 404 when order does not exist', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const req = mockRequest({ id: orderId });
    const res = mockResponse();

    await invokeHandler(deleteOrder, req as AuthenticatedRequest, res as unknown as Response);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(res.body.message).toBe('Pedido não encontrado');
  });

  it('should broadcast order_deleted event after successful deletion', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: orderId, daily_number: 1, customer_name: 'Maria', status: 'preparando', payment_status: 'pago' }],
    });
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

    const req = mockRequest({ id: orderId });
    const res = mockResponse();

    await invokeHandler(deleteOrder, req as AuthenticatedRequest, res as unknown as Response);

    expect(res.statusCode).toBe(204);
    expect(mockBroadcast).toHaveBeenCalledWith('orders:queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'order_deleted', {
      id: orderId,
      tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('should allow deletion regardless of order status', async () => {
    for (const status of ['aguardando', 'preparando', 'pronto', 'entregue']) {
      vi.clearAllMocks();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: orderId, daily_number: 1, customer_name: 'Test', status, payment_status: 'pendente' }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const req = mockRequest({ id: orderId });
      const res = mockResponse();

      await invokeHandler(deleteOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(204);
    }
  });

  it('should allow deletion regardless of payment status', async () => {
    for (const paymentStatus of ['pendente', 'pago']) {
      vi.clearAllMocks();
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: orderId, daily_number: 1, customer_name: 'Test', status: 'entregue', payment_status: paymentStatus }],
      });
      mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

      const req = mockRequest({ id: orderId });
      const res = mockResponse();

      await invokeHandler(deleteOrder, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(204);
    }
  });

  it('should return 500 on database error', async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error('DB connection lost'));

    const req = mockRequest({ id: orderId });
    const res = mockResponse();

    await invokeHandler(deleteOrder, req as AuthenticatedRequest, res as unknown as Response);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    // Mensagem genérica única do error middleware (não mais fallback por-endpoint).
    expect(res.body.message).toBe('Erro ao processar requisição');
  });
});
