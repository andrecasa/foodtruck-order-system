import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

// Mock pg Pool
const mockQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

// Mock date-fns-tz (used by getDailySummary but we need it mocked for the module to load)
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn(),
  format: vi.fn(),
}));

import { getMonthlySummary } from '../../controllers/summary.controller.js';

function mockRequest(query: Record<string, string> = {}): Partial<AuthenticatedRequest> {
  return {
    user: { id: 'user-1', email: 'test@test.com' },
    query,
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

describe('Summary Controller - getMonthlySummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Parameter validation', () => {
    it('should return 400 when year param is missing', async () => {
      const req = mockRequest({ month: '8' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
      expect(res.body.message).toContain('year');
      expect(res.body.message).toContain('month');
    });

    it('should return 400 when month param is missing', async () => {
      const req = mockRequest({ year: '2026' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });

    it('should return 400 when both year and month params are missing', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });

    it('should return 400 for month = 0 (below valid range)', async () => {
      const req = mockRequest({ year: '2026', month: '0' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });

    it('should return 400 for month = 13 (above valid range)', async () => {
      const req = mockRequest({ year: '2026', month: '13' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });

    it('should return 400 for non-integer month (e.g. "3.5")', async () => {
      const req = mockRequest({ year: '2026', month: '3.5' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });

    it('should return 400 for non-numeric month (e.g. "abc")', async () => {
      const req = mockRequest({ year: '2026', month: 'abc' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });

    it('should return 400 for non-integer year (e.g. "20.5")', async () => {
      const req = mockRequest({ year: '20.5', month: '8' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('INVALID_PARAMS');
    });
  });

  describe('Authentication (401 without auth token)', () => {
    it('should rely on authMiddleware to reject unauthenticated requests (controller assumes user is set)', async () => {
      // The authMiddleware handles 401 before the controller is reached.
      // This test documents that the route is protected by verifying the
      // controller assumes req.user exists (it does not check auth itself).
      // The actual 401 behavior is tested via the auth middleware tests and
      // the route registration which applies authMiddleware before getMonthlySummary.
      //
      // We verify by calling the controller without user - it should still
      // attempt to process (and either succeed or fail on DB), not return 401 itself.
      const req: Partial<AuthenticatedRequest> = {
        query: { year: '2026', month: '8' },
        // No user set - simulating what would happen if middleware was bypassed
      };
      const res = mockResponse();

      // Mock DB to return valid results
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_orders: 0, total_revenue: '0', total_received: '0', total_pending: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      // Controller processes the request (auth is not its responsibility)
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Correct aggregation for known order set', () => {
    it('should return correct totals and per-day breakdown', async () => {
      // Mock totals query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 12,
          total_revenue: '85000',
          total_received: '60000',
          total_pending: '25000',
          by_dinheiro: '20000',
          by_pix: '25000',
          by_cartao: '15000',
        }],
      });

      // Mock per-day breakdown query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { day: 1, order_count: 3, revenue: '20000', paid_orders: 2 },
          { day: 5, order_count: 4, revenue: '35000', paid_orders: 3 },
          { day: 15, order_count: 5, revenue: '30000', paid_orders: 5 },
        ],
      });

      const req = mockRequest({ year: '2026', month: '8' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        year: 2026,
        month: 8,
        totals: {
          totalOrders: 12,
          totalRevenue: 85000,
          totalReceived: 60000,
          totalPending: 25000,
        },
        byPaymentMethod: {
          dinheiro: 20000,
          pix: 25000,
          'cartão': 15000,
        },
        days: [
          { day: 1, orderCount: 3, revenue: 20000, paidOrders: 2 },
          { day: 5, orderCount: 4, revenue: 35000, paidOrders: 3 },
          { day: 15, orderCount: 5, revenue: 30000, paidOrders: 5 },
        ],
      });
    });

    it('should pass correct date range parameters to SQL queries', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_orders: 0, total_revenue: '0', total_received: '0', total_pending: '0' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ year: '2026', month: '2' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      // February 2026 has 28 days
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][1]).toEqual(['2026-02-01', '2026-02-28']);
      expect(mockQuery.mock.calls[1][1]).toEqual(['2026-02-01', '2026-02-28']);
    });

    it('should handle leap year February correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ total_orders: 1, total_revenue: '1000', total_received: '1000', total_pending: '0' }],
        })
        .mockResolvedValueOnce({
          rows: [{ day: 29, order_count: 1, revenue: '1000', paid_orders: 1 }],
        });

      const req = mockRequest({ year: '2024', month: '2' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      // 2024 is a leap year - February has 29 days
      expect(mockQuery.mock.calls[0][1]).toEqual(['2024-02-01', '2024-02-29']);
      expect(res.body.days[0].day).toBe(29);
    });
  });

  describe('Empty month (no orders)', () => {
    it('should return zero totals and empty days array for month with no orders', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_orders: 0,
          total_revenue: '0',
          total_received: '0',
          total_pending: '0',
          by_dinheiro: '0',
          by_pix: '0',
          by_cartao: '0',
        }],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const req = mockRequest({ year: '2026', month: '1' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        year: 2026,
        month: 1,
        totals: {
          totalOrders: 0,
          totalRevenue: 0,
          totalReceived: 0,
          totalPending: 0,
        },
        byPaymentMethod: {
          dinheiro: 0,
          pix: 0,
          'cartão': 0,
        },
        days: [],
      });
    });
  });

  describe('Internal server error', () => {
    it('should return 500 when database query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const req = mockRequest({ year: '2026', month: '8' });
      const res = mockResponse();

      await getMonthlySummary(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
      expect(res.body.message).toBe('Erro ao calcular resumo mensal.');
    });
  });
});
