import { type Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/tenant.middleware.js';
import * as summaryService from '../services/summary.service.js';
import { ServiceError } from '../services/service-error.js';

// Erros de validação/negócio são lançados como ServiceError e mapeados
// centralmente pelo errorHandler (src/http/error-handler.js). As rotas envolvem
// estes handlers em asyncHandler para que rejeições async cheguem ao errorHandler.

/**
 * GET /api/summary/today
 * Returns the daily summary (aggregated orders) for a given date.
 * Accepts optional query param: ?date=YYYY-MM-DD
 */
export async function getDailySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const dateParam = req.query.date as string | undefined;
  const summary = await summaryService.getDailySummary(req.tenantId as string, dateParam);
  res.status(200).json(summary);
}

/**
 * GET /api/summary/monthly
 * Returns monthly accumulated totals and per-day breakdown for a given year/month.
 */
export async function getMonthlySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { year, month } = parseYearMonth(req);
  const response = await summaryService.getMonthlySummary(req.tenantId as string, year, month);
  res.status(200).json(response);
}

/**
 * Valida os parâmetros `year`/`month` da query, comuns aos endpoints mensais.
 * Retorna os números validados ou lança `ServiceError(..., 400, 'INVALID_PARAMS')`
 * — mapeado centralmente pelo errorHandler, preservando o contrato de resposta.
 */
function parseYearMonth(req: AuthenticatedRequest): { year: number; month: number } {
  const yearParam = req.query.year;
  const monthParam = req.query.month;

  if (!yearParam || !monthParam) {
    throw new ServiceError('Os parâmetros "year" e "month" são obrigatórios.', 400, 'INVALID_PARAMS');
  }

  const year = Number(yearParam);
  const month = Number(monthParam);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new ServiceError(
      'O parâmetro "year" deve ser um inteiro e "month" deve ser um inteiro entre 1 e 12.',
      400,
      'INVALID_PARAMS',
    );
  }

  return { year, month };
}

/**
 * GET /api/summary/monthly/heatmap
 * Retorna os pontos do mapa de calor (só pedidos geolocalizados) e os
 * contadores total/geolocalizado do mês para um year/month.
 */
export async function getMonthlyHeatmap(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { year, month } = parseYearMonth(req);
  const response = await summaryService.getMonthlyHeatmap(req.tenantId as string, year, month);
  res.status(200).json(response);
}

/** Valida um UUID v1–v5 (formato canônico com hífens), usado no filtro de categorias. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Faz o parse do filtro opcional de categorias (`?categoryIds=uuid1,uuid2`).
 * Aceita CSV; ignora entradas vazias (ex.: vírgulas soltas). Lança
 * `ServiceError(..., 400, 'INVALID_PARAMS')` se algum id não for um UUID válido,
 * mapeado centralmente pelo errorHandler. Ausência do parâmetro = `[]` (todas).
 */
function parseCategoryIds(req: AuthenticatedRequest): string[] {
  const raw = req.query.categoryIds;
  if (raw === undefined) {
    return [];
  }
  if (typeof raw !== 'string') {
    throw new ServiceError('O parâmetro "categoryIds" deve ser uma lista separada por vírgulas.', 400, 'INVALID_PARAMS');
  }

  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  for (const id of ids) {
    if (!UUID_RE.test(id)) {
      throw new ServiceError(`Categoria inválida no filtro: "${id}".`, 400, 'INVALID_PARAMS');
    }
  }

  return ids;
}

/**
 * GET /api/summary/top-products/daily
 * Retorna o Top 10 produtos mais vendidos do dia (ranking único agregado,
 * ordenado por quantidade). Query params: `date` (opcional, YYYY-MM-DD; default
 * hoje no fuso America/Sao_Paulo) e `categoryIds` (opcional, CSV de UUIDs).
 */
export async function getDailyTopProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const dateParam = req.query.date as string | undefined;
  const categoryIds = parseCategoryIds(req);
  const response = await summaryService.getDailyTopProducts(req.tenantId as string, {
    date: dateParam,
    categoryIds,
  });
  res.status(200).json(response);
}

/**
 * GET /api/summary/top-products/monthly
 * Retorna o Top 10 produtos mais vendidos do mês (ranking único agregado,
 * ordenado por quantidade). Query params: `year`/`month` (obrigatórios) e
 * `categoryIds` (opcional, CSV de UUIDs).
 */
export async function getMonthlyTopProducts(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { year, month } = parseYearMonth(req);
  const categoryIds = parseCategoryIds(req);
  const response = await summaryService.getMonthlyTopProducts(req.tenantId as string, {
    year,
    month,
    categoryIds,
  });
  res.status(200).json(response);
}
