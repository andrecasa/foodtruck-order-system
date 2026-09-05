import { tenantRepository } from '../db/tenant-repository.js';
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

/**
 * Cache key is scoped to the tenant so one tenant's monthly summary can never
 * be served to another (R6.1). Different tenants keep independent cache entries
 * for the same year/month.
 */
function getCacheKey(tenantId: string, year: number, month: number): string {
  return `${tenantId}:${year}-${month}`;
}

function isCurrentMonth(year: number, month: number): boolean {
  const now = new Date();
  const zonedNow = toZonedTime(now, SAO_PAULO_TZ);
  return zonedNow.getFullYear() === year && zonedNow.getMonth() + 1 === month;
}

/**
 * Invalidate cache for a specific tenant/month (called after order changes).
 * Without a year/month, clears every cached month for the tenant.
 */
export function invalidateMonthlySummaryCache(tenantId: string, year?: number, month?: number): void {
  if (year && month) {
    monthlyCache.delete(getCacheKey(tenantId, year, month));
  } else {
    const prefix = `${tenantId}:`;
    for (const key of monthlyCache.keys()) {
      if (key.startsWith(prefix)) {
        monthlyCache.delete(key);
      }
    }
  }
}

// --- Error classes ---

import { ServiceError } from './service-error.js';
export { ServiceError };

// --- Service functions ---

/**
 * Returns the daily summary (aggregated orders) for a given tenant and date.
 * If no date provided, defaults to today in America/Sao_Paulo timezone (R12.6).
 * The aggregation is scoped to `tenantId` via the TenantRepository (R6.1): the
 * mandatory `$1` tenant placeholder guarantees only this tenant's orders are
 * aggregated.
 */
export async function getDailySummary(tenantId: string, dateParam?: string): Promise<DailySummary> {
  const repo = tenantRepository(tenantId);

  let targetDate: string;

  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    targetDate = dateParam;
  } else {
    const now = new Date();
    const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
    targetDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
  }

  const rows = await repo.raw<{
    total_orders: number;
    paid_orders: number;
    pending_orders: number;
    paid_total: number;
    pending_total: number;
    by_dinheiro: number;
    by_pix: number;
    by_cartao_debito: number;
    by_cartao_credito: number;
  }>(
    `SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE payment_status = 'pago')::int AS paid_orders,
      COUNT(*) FILTER (WHERE payment_status = 'pendente')::int AS pending_orders,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago'), 0)::int AS paid_total,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pendente'), 0)::int AS pending_total,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'dinheiro'), 0)::int AS by_dinheiro,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'pix'), 0)::int AS by_pix,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'cartão débito'), 0)::int AS by_cartao_debito,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'cartão crédito'), 0)::int AS by_cartao_credito
    FROM orders
    WHERE tenant_id = $1 AND order_date = $2`,
    [tenantId, targetDate],
  );

  // The aggregation always yields exactly one row (COUNT/SUM over the set).
  const row = rows[0]!;

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
      'cartão débito': row.by_cartao_debito,
      'cartão crédito': row.by_cartao_credito,
    },
  };
}

/**
 * Returns monthly accumulated totals and per-day breakdown for a given tenant
 * and year/month. Results are cached per tenant/month (R6.1): the cache key
 * includes the tenantId so no cross-tenant data can be served from cache.
 */
export async function getMonthlySummary(
  tenantId: string,
  year: number,
  month: number,
): Promise<MonthlySummaryResponse> {
  const repo = tenantRepository(tenantId);

  // Serve from the tenant-scoped cache when still fresh.
  const cacheKey = getCacheKey(tenantId, year, month);
  const cached = monthlyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Calculate first and last day of the month
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Query monthly totals (tenant_id = $1 is mandatory for raw()).
  const totalsRows = await repo.raw<{
    total_orders: number;
    total_revenue: string;
    total_received: string;
    total_pending: string;
    by_dinheiro: string;
    by_pix: string;
    by_cartao_debito: string;
    by_cartao_credito: string;
  }>(
    `SELECT
      COUNT(*)::int AS total_orders,
      COALESCE(SUM(total_amount_cents), 0)::bigint AS total_revenue,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago'), 0)::bigint AS total_received,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pendente'), 0)::bigint AS total_pending,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'dinheiro'), 0)::bigint AS by_dinheiro,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'pix'), 0)::bigint AS by_pix,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'cartão débito'), 0)::bigint AS by_cartao_debito,
      COALESCE(SUM(total_amount_cents) FILTER (WHERE payment_status = 'pago' AND payment_method = 'cartão crédito'), 0)::bigint AS by_cartao_credito
    FROM orders
    WHERE tenant_id = $1 AND order_date >= $2 AND order_date <= $3`,
    [tenantId, firstDay, lastDay],
  );

  // Query per-day breakdown (tenant_id = $1 is mandatory for raw()).
  const daysRows = await repo.raw<{ day: number; order_count: number; revenue: string; paid_orders: number }>(
    `SELECT
      EXTRACT(DAY FROM order_date)::int AS day,
      COUNT(*)::int AS order_count,
      COALESCE(SUM(total_amount_cents), 0)::bigint AS revenue,
      COUNT(*) FILTER (WHERE payment_status = 'pago')::int AS paid_orders
    FROM orders
    WHERE tenant_id = $1 AND order_date >= $2 AND order_date <= $3
    GROUP BY EXTRACT(DAY FROM order_date)
    ORDER BY day`,
    [tenantId, firstDay, lastDay],
  );

  // The totals aggregation always yields exactly one row.
  const totalsRow = totalsRows[0]!;

  const days: DayBreakdown[] = daysRows.map((row) => ({
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
    byPaymentMethod: {
      dinheiro: Number(totalsRow.by_dinheiro) || 0,
      pix: Number(totalsRow.by_pix) || 0,
      'cartão débito': Number(totalsRow.by_cartao_debito) || 0,
      'cartão crédito': Number(totalsRow.by_cartao_credito) || 0,
    },
    days,
  };

  // Store in the tenant-scoped cache with a TTL that depends on whether the
  // requested month is the current month (shorter) or a past month (longer).
  const ttl = isCurrentMonth(year, month) ? CACHE_TTL_CURRENT_MONTH : CACHE_TTL_PAST_MONTH;
  monthlyCache.set(cacheKey, { data: response, expiresAt: Date.now() + ttl });

  return response;
}
