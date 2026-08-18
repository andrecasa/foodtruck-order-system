import { pool } from '../config/database.js';
import { toZonedTime, format } from 'date-fns-tz';
import type { DailySummary, MonthlySummaryResponse, DayBreakdown } from '@order-system/shared';

// --- Constants ---

const SAO_PAULO_TZ = 'America/Sao_Paulo';

// --- Cache for monthly summary (past months never change) ---

interface CacheEntry {
  data: MonthlySummaryResponse;
  expiresAt: number;
}

const monthlyCache = new Map<string, CacheEntry>();
const CACHE_TTL_CURRENT_MONTH = 60_000; // 1 minute for current month
const CACHE_TTL_PAST_MONTH = 3600_000;  // 1 hour for past months

function getCacheKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date();
  const zonedNow = toZonedTime(now, SAO_PAULO_TZ);
  return zonedNow.getFullYear() === year && zonedNow.getMonth() + 1 === month;
}

/** Invalidate cache for a specific month (called after order changes) */
export function invalidateMonthlySummaryCache(year?: number, month?: number): void {
  if (year && month) {
    monthlyCache.delete(getCacheKey(year, month));
  } else {
    monthlyCache.clear();
  }
}

// --- Error classes ---

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// --- Service functions ---

/**
 * Returns the daily summary (aggregated orders) for a given date.
 * If no date provided, defaults to today in America/Sao_Paulo timezone.
 */
export async function getDailySummary(dateParam?: string): Promise<DailySummary> {
  let targetDate: string;

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam;
  } else {
    const now = new Date();
    const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
    targetDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
  }

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

  return {
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
}

/**
 * Returns monthly accumulated totals and per-day breakdown for a given year/month.
 */
export async function getMonthlySummary(year: number, month: number): Promise<MonthlySummaryResponse> {
  // Calculate first and last day of the month
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Query monthly totals
  const totalsResult = await pool.query(
    `SELECT
      COUNT(*)::int AS total_orders,
      COALESCE(SUM(total_amount_cents), 0)::bigint AS total_revenue,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago'), 0)::bigint AS total_received,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pendente'), 0)::bigint AS total_pending,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'dinheiro'), 0)::bigint AS by_dinheiro,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'pix'), 0)::bigint AS by_pix,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'cartão'), 0)::bigint AS by_cartao
    FROM orders
    WHERE order_date >= $1 AND order_date <= $2`,
    [firstDay, lastDay]
  );

  // Query per-day breakdown
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

  const days: DayBreakdown[] = daysResult.rows.map((row: { day: number; order_count: number; revenue: string; paid_orders: number }) => ({
    day: row.day,
    orderCount: row.order_count,
    revenue: Number(row.revenue),
    paidOrders: row.paid_orders,
  }));

  return {
    year,
    month,
    totals: {
      totalOrders: totalsRow.total_orders,
      totalRevenue: Number(totalsRow.total_revenue),
      totalReceived: Number(totalsRow.total_received),
      totalPending: Number(totalsRow.total_pending),
    },
    byPaymentMethod: {
      dinheiro: Number(totalsRow.by_dinheiro) || 0,
      pix: Number(totalsRow.by_pix) || 0,
      'cartão': Number(totalsRow.by_cartao) || 0,
    },
    days,
  };
}
