import { Response } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { toZonedTime, format } from 'date-fns-tz';
import type { DailySummary, MonthlySummaryResponse, DayBreakdown } from '@order-system/shared';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * GET /api/summary/today
 * Returns the daily summary (aggregated orders) for a given date.
 * Accepts optional query param: ?date=YYYY-MM-DD
 * If no date provided, defaults to today in America/Sao_Paulo timezone.
 */
export async function getDailySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Get target date: from query param or today in America/Sao_Paulo timezone
    let targetDate: string;
    const dateParam = req.query.date as string | undefined;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      targetDate = dateParam;
    } else {
      const now = new Date();
      const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
      targetDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
    }

    // 2. Query aggregated data for today's orders
    const result = await pool.query(
      `SELECT
        COUNT(*)::int AS total_orders,
        COUNT(*) FILTER (WHERE payment_status = 'pago')::int AS paid_orders,
        COUNT(*) FILTER (WHERE payment_status = 'pendente')::int AS pending_orders,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago'), 0)::int AS paid_total,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pendente'), 0)::int AS pending_total,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'dinheiro'), 0)::int AS by_dinheiro,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'pix'), 0)::int AS by_pix,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'cartão'), 0)::int AS by_cartao
      FROM orders
      WHERE order_date = $1`,
      [targetDate]
    );

    const row = result.rows[0];

    // 3. Build response conforming to DailySummary interface
    const summary: DailySummary = {
      date: targetDate,
      totalOrders: row.total_orders,
      paidOrders: row.paid_orders,
      pendingOrders: row.pending_orders,
      paidTotal: row.paid_total,
      pendingTotal: row.pending_total,
      byPaymentMethod: {
        dinheiro: row.by_dinheiro,
        pix: row.by_pix,
        'cartão': row.by_cartao,
      },
    };

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
 * Uses America/Sao_Paulo timezone for date calculations.
 */
export async function getMonthlySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate query parameters
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

    // 2. Calculate first and last day of the month in America/Sao_Paulo timezone
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    // 3. Query monthly totals
    const totalsResult = await pool.query(
      `SELECT
        COUNT(*)::int AS total_orders,
        COALESCE(SUM(total_amount_cents), 0)::bigint AS total_revenue,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago'), 0)::bigint AS total_received,
        COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pendente'), 0)::bigint AS total_pending
      FROM orders
      WHERE order_date >= $1 AND order_date <= $2`,
      [firstDay, lastDay]
    );

    // 4. Query per-day breakdown
    const daysResult = await pool.query(
      `SELECT
        EXTRACT(DAY FROM order_date)::int AS day,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_amount_cents), 0)::bigint AS revenue,
        COUNT(*) FILTER (WHERE payment_status = 'pago')::int AS paid_orders
      FROM orders
      WHERE order_date >= $1 AND order_date <= $2
      GROUP BY EXTRACT(DAY FROM order_date)
      ORDER BY day`,
      [firstDay, lastDay]
    );

    const totalsRow = totalsResult.rows[0];

    // 5. Build response
    const days: DayBreakdown[] = daysResult.rows.map((row: { day: number; order_count: number; revenue: string; paid_orders: number }) => ({
      day: row.day,
      orderCount: row.order_count,
      revenue: Number(row.revenue),
      paidOrders: row.paid_orders,
    }));

    const response: MonthlySummaryResponse = {
      year,
      month,
      totals: {
        totalOrders: totalsRow.total_orders,
        totalRevenue: Number(totalsRow.total_revenue),
        totalReceived: Number(totalsRow.total_received),
        totalPending: Number(totalsRow.total_pending),
      },
      days,
    };

    res.status(200).json(response);
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao calcular resumo mensal.',
    });
  }
}
