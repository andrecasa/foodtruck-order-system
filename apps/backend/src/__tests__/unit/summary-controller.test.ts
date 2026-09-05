import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

// Mock pg Pool
const mockQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

// Mock date-fns-tz
const mockToZonedTime = vi.fn();
const mockFormat = vi.fn();

vi.mock('date-fns-tz', () => ({
  toZonedTime: (...args: any[]) => mockToZonedTime(...args),
  format: (...args: any[]) => mockFormat(...args),
}));

import { getDailySummary } from '../../controllers/summary.controller.js';

function mockRequest(): Partial<AuthenticatedRequest> {
  return {
    user: { id: 'user-1', email: 'test@test.com' },
    tenantId: TENANT,
    query: {},
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

describe('Summary Controller - getDailySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToZonedTime.mockReturnValue(new Date('2024-06-15T10:00:00'));
    mockFormat.mockReturnValue('2024-06-15');
  });

  describe('Empty day (no orders)', () => {
    it('should return all zeros when no orders exist for today', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 0,
          paid_orders: 0,
          pending_orders: 0,
          paid_total: 0,
          pending_total: 0,
          by_dinheiro: 0,
          by_pix: 0,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        date: '2024-06-15',
        totalOrders: 0,
        paidOrders: 0,
        pendingOrders: 0,
        paidTotal: 0,
        pendingTotal: 0,
        byPaymentMethod: {
          dinheiro: 0,
          pix: 0,
          'cartão débito': 0,
          'cartão crédito': 0,
        },
      });
    });
  });

  describe('Mix of paid/pending orders', () => {
    it('should correctly aggregate paid and pending orders', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 5,
          paid_orders: 3,
          pending_orders: 2,
          paid_total: 4500,
          pending_total: 2000,
          by_dinheiro: 1500,
          by_pix: 2000,
          by_cartao_debito: 0,
          by_cartao_credito: 1000,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalOrders).toBe(5);
      expect(res.body.paidOrders).toBe(3);
      expect(res.body.pendingOrders).toBe(2);
      expect(res.body.paidTotal).toBe(4500);
      expect(res.body.pendingTotal).toBe(2000);
    });
  });

  describe('byPaymentMethod breakdown', () => {
    it('should return correct sums per payment method', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 6,
          paid_orders: 6,
          pending_orders: 0,
          paid_total: 9000,
          pending_total: 0,
          by_dinheiro: 3000,
          by_pix: 4000,
          by_cartao_debito: 1500,
          by_cartao_credito: 500,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.byPaymentMethod).toEqual({
        dinheiro: 3000,
        pix: 4000,
        'cartão débito': 1500,
        'cartão crédito': 500,
      });
      // Verify sum of byPaymentMethod equals paidTotal
      const methodSum = res.body.byPaymentMethod.dinheiro
        + res.body.byPaymentMethod.pix
        + res.body.byPaymentMethod['cartão débito']
        + res.body.byPaymentMethod['cartão crédito'];
      expect(methodSum).toBe(res.body.paidTotal);
    });

    it('should handle case where only one payment method is used', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 3,
          paid_orders: 3,
          pending_orders: 0,
          paid_total: 5000,
          pending_total: 0,
          by_dinheiro: 0,
          by_pix: 5000,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.byPaymentMethod.dinheiro).toBe(0);
      expect(res.body.byPaymentMethod.pix).toBe(5000);
      expect(res.body.byPaymentMethod['cartão débito']).toBe(0);
      expect(res.body.byPaymentMethod['cartão crédito']).toBe(0);
    });
  });

  describe('Midnight boundary (timezone handling)', () => {
    it('should use date-fns-tz to convert current time to SP timezone', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 1,
          paid_orders: 0,
          pending_orders: 1,
          paid_total: 0,
          pending_total: 800,
          by_dinheiro: 0,
          by_pix: 0,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(mockToZonedTime).toHaveBeenCalledWith(expect.any(Date), 'America/Sao_Paulo');
      expect(mockFormat).toHaveBeenCalledWith(
        expect.any(Date),
        'yyyy-MM-dd',
        { timeZone: 'America/Sao_Paulo' }
      );
    });

    it('should query with correct date when UTC is next day but SP is still today', async () => {
      // Simulate: UTC time is 2024-06-16T02:30:00Z (next day)
      // but in SP (UTC-3) it's still 2024-06-15T23:30:00
      mockToZonedTime.mockReturnValue(new Date('2024-06-15T23:30:00'));
      mockFormat.mockReturnValue('2024-06-15');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 2,
          paid_orders: 1,
          pending_orders: 1,
          paid_total: 1500,
          pending_total: 800,
          by_dinheiro: 1500,
          by_pix: 0,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.date).toBe('2024-06-15');
      // Verify query used the SP date and is scoped to the tenant
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1 AND order_date = $2'),
        [TENANT, '2024-06-15']
      );
    });

    it('should use next day date when SP has crossed midnight but UTC has not', async () => {
      // Simulate: UTC time is 2024-06-15T02:30:00Z
      // In SP (UTC-3 during standard time) it would be 2024-06-14T23:30:00
      // But let's test when SP crosses midnight: UTC is 2024-06-16T02:30:00Z -> SP is 2024-06-15T23:30
      // More precisely: UTC 2024-06-15T03:30:00 -> SP 2024-06-15T00:30:00 (just after midnight)
      mockToZonedTime.mockReturnValue(new Date('2024-06-15T00:30:00'));
      mockFormat.mockReturnValue('2024-06-15');

      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 0,
          paid_orders: 0,
          pending_orders: 0,
          paid_total: 0,
          pending_total: 0,
          by_dinheiro: 0,
          by_pix: 0,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.date).toBe('2024-06-15');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1 AND order_date = $2'),
        [TENANT, '2024-06-15']
      );
    });
  });

  describe('Invariant: totalOrders = paidOrders + pendingOrders', () => {
    it('should always satisfy totalOrders = paidOrders + pendingOrders', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 10,
          paid_orders: 7,
          pending_orders: 3,
          paid_total: 15000,
          pending_total: 5000,
          by_dinheiro: 5000,
          by_pix: 6000,
          by_cartao_debito: 2000,
          by_cartao_credito: 2000,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalOrders).toBe(res.body.paidOrders + res.body.pendingOrders);
    });

    it('should satisfy invariant even when all orders are paid', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 4,
          paid_orders: 4,
          pending_orders: 0,
          paid_total: 8000,
          pending_total: 0,
          by_dinheiro: 2000,
          by_pix: 3000,
          by_cartao_debito: 2000,
          by_cartao_credito: 1000,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.body.totalOrders).toBe(res.body.paidOrders + res.body.pendingOrders);
    });

    it('should satisfy invariant even when all orders are pending', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 3,
          paid_orders: 0,
          pending_orders: 3,
          paid_total: 0,
          pending_total: 6000,
          by_dinheiro: 0,
          by_pix: 0,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.body.totalOrders).toBe(res.body.paidOrders + res.body.pendingOrders);
    });
  });

  describe('Internal server error', () => {
    it('should return 500 when database query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection failed'));

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
      expect(res.body.message).toBe('Erro ao calcular resumo do dia.');
    });
  });

  describe('SQL query structure', () => {
    it('should filter by order_date parameter', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 0,
          paid_orders: 0,
          pending_orders: 0,
          paid_total: 0,
          pending_total: 0,
          by_dinheiro: 0,
          by_pix: 0,
          by_cartao_debito: 0,
          by_cartao_credito: 0,
        }],
      });

      const req = mockRequest();
      const res = mockResponse();

      await getDailySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const call = mockQuery.mock.calls[0]!;
      const sql = call[0];
      const params = call[1];
      expect(sql).toContain('FROM orders');
      expect(sql).toContain('WHERE tenant_id = $1 AND order_date = $2');
      expect(params).toEqual([TENANT, '2024-06-15']);
    });
  });
});
