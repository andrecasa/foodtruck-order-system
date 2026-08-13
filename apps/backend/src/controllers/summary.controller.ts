import { Response } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { toZonedTime, format } from 'date-fns-tz';
import type { DailySummary } from '@order-system/shared';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * GET /api/summary/today
 * Returns the daily summary (aggregated orders) for today in America/Sao_Paulo timezone.
 */
export async function getDailySummary(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Get today's date in America/Sao_Paulo timezone
    const now = new Date();
    const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
    const todayDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

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
      [todayDate]
    );

    const row = result.rows[0];

    // 3. Build response conforming to DailySummary interface
    const summary: DailySummary = {
      date: todayDate,
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
