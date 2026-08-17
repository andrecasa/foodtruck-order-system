import { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import * as summaryService from '../services/summary.service.js';

/**
 * GET /api/summary/today
 * Returns the daily summary (aggregated orders) for a given date.
 * Accepts optional query param: ?date=YYYY-MM-DD
 */
export async function getDailySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const dateParam = req.query.date as string | undefined;
    const summary = await summaryService.getDailySummary(dateParam);
    res.status(200).json(summary);
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao calcular resumo do dia.',
    });
  }
}

/**
 * GET /api/summary/monthly
 * Returns monthly accumulated totals and per-day breakdown for a given year/month.
 */
export async function getMonthlySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const yearParam = req.query.year;
    const monthParam = req.query.month;

    if (!yearParam || !monthParam) {
      res.status(400).json({
        error: 'INVALID_PARAMS',
        message: 'Os parâmetros "year" e "month" são obrigatórios.',
      });
      return;
    }

    const year = Number(yearParam);
    const month = Number(monthParam);

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      res.status(400).json({
        error: 'INVALID_PARAMS',
        message: 'O parâmetro "year" deve ser um inteiro e "month" deve ser um inteiro entre 1 e 12.',
      });
      return;
    }

    const response = await summaryService.getMonthlySummary(year, month);
    res.status(200).json(response);
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao calcular resumo mensal.',
    });
  }
}
