import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

const TENANT = '22222222-2222-2222-2222-222222222222';

// Mock pg Pool
const mockQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

// isCurrentMonth usa toZonedTime; data futura fixa mantém os meses pedidos
// (passados) como não-corrente, evitando interferência do cache entre testes.
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn(() => new Date('2099-01-01T00:00:00')),
  format: vi.fn(),
}));

import { getMonthlyHeatmap } from '../../controllers/summary.controller.js';
import { invalidateMonthlySummaryCache } from '../../services/summary.service.js';

function mockRequest(query: Record<string, string> = {}): Partial<AuthenticatedRequest> {
  return {
    user: { id: 'user-1', email: 'test@test.com' },
    tenantId: TENANT,
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

describe('Summary Controller - getMonthlyHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Cache é por tenant/mês; limpa entre testes (invalida também o :heatmap).
    invalidateMonthlySummaryCache(TENANT);
  });

  // Validação/erros agora lançam ServiceError; o mapeamento HTTP fica a cargo
  // do errorHandler central (via asyncHandler nas rotas), não do controller.
  describe('Validação de parâmetros', () => {
    it('lança ServiceError 400 INVALID_PARAMS quando year está ausente', async () => {
      const req = mockRequest({ month: '8' });
      const res = mockResponse();
      await expect(
        getMonthlyHeatmap(req as AuthenticatedRequest, res as unknown as Response),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PARAMS' });
      expect(res.statusCode).toBe(0);
    });

    it('lança ServiceError 400 INVALID_PARAMS para month fora do intervalo (13)', async () => {
      const req = mockRequest({ year: '2026', month: '13' });
      const res = mockResponse();
      await expect(
        getMonthlyHeatmap(req as AuthenticatedRequest, res as unknown as Response),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PARAMS' });
      expect(res.statusCode).toBe(0);
    });
  });

  describe('Agregação e contadores', () => {
    it('retorna contadores (total vs geolocalizado) e pontos agregados', async () => {
      // Query 1: contadores. Query 2: pontos agregados.
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_orders: 10, geolocated_orders: 4 }] })
        .mockResolvedValueOnce({
          rows: [
            { lat: '-23.5500', lng: '-46.6300', weight: 3 },
            { lat: '-23.6000', lng: '-46.7000', weight: 1 },
          ],
        });

      const req = mockRequest({ year: '2026', month: '8' });
      const res = mockResponse();
      await getMonthlyHeatmap(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        year: 2026,
        month: 8,
        totalOrders: 10,
        geolocatedOrders: 4,
        points: [
          { latitude: -23.55, longitude: -46.63, weight: 3 },
          { latitude: -23.6, longitude: -46.7, weight: 1 },
        ],
      });
    });

    it('passa o intervalo de datas correto para as queries (fev não bissexto)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_orders: 0, geolocated_orders: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ year: '2026', month: '2' });
      const res = mockResponse();
      await getMonthlyHeatmap(req as AuthenticatedRequest, res as unknown as Response);

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery.mock.calls[0][1]).toEqual([TENANT, '2026-02-01', '2026-02-28']);
      expect(mockQuery.mock.calls[1][1]).toEqual([TENANT, '2026-02-01', '2026-02-28']);
    });

    it('mês sem pedidos geolocalizados retorna pontos vazios mas mantém o total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_orders: 7, geolocated_orders: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ year: '2026', month: '3' });
      const res = mockResponse();
      await getMonthlyHeatmap(req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.totalOrders).toBe(7);
      expect(res.body.geolocatedOrders).toBe(0);
      expect(res.body.points).toEqual([]);
    });
  });

  // Erros inesperados sobem sem serem engolidos; o asyncHandler os encaminha ao
  // errorHandler central, que responde 500 INTERNAL_ERROR. O controller não
  // captura mais o erro nem responde 500 manualmente.
  describe('Erro interno', () => {
    it('propaga o erro quando a query falha (mapeado a 500 pelo errorHandler)', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));
      const req = mockRequest({ year: '2026', month: '8' });
      const res = mockResponse();
      await expect(
        getMonthlyHeatmap(req as AuthenticatedRequest, res as unknown as Response),
      ).rejects.toThrow('Connection refused');
      expect(res.statusCode).toBe(0);
    });
  });
});
