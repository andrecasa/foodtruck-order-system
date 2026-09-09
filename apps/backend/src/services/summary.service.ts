import { tenantRepository } from '../db/tenant-repository.js';
import { toZonedTime, format } from 'date-fns-tz';
import type {
  DailySummary,
  MonthlySummaryResponse,
  DayBreakdown,
  MonthlyHeatmapResponse,
  HeatmapPoint,
  TopProduct,
  TopProductsResponse,
} from '@order-system/shared';

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

// Cache do heatmap mensal, separado do de totais (chave sufixada com :heatmap)
// para não colidir. Segue a mesma política de TTL: mês corrente muda (TTL curto),
// meses passados são imutáveis (TTL longo).
interface HeatmapCacheEntry {
  data: MonthlyHeatmapResponse;
  expiresAt: number;
}
const heatmapCache = new Map<string, HeatmapCacheEntry>();

/**
 * Cache key is scoped to the tenant so one tenant's monthly summary can never
 * be served to another (R6.1). Different tenants keep independent cache entries
 * for the same year/month.
 */
function getCacheKey(tenantId: string, year: number, month: number): string {
  return `${tenantId}:${year}-${month}`;
}

/** Chave do cache do heatmap (sufixo :heatmap para não colidir com os totais). */
function getHeatmapCacheKey(tenantId: string, year: number, month: number): string {
  return `${tenantId}:${year}-${month}:heatmap`;
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
    heatmapCache.delete(getHeatmapCacheKey(tenantId, year, month));
  } else {
    const prefix = `${tenantId}:`;
    for (const key of monthlyCache.keys()) {
      if (key.startsWith(prefix)) {
        monthlyCache.delete(key);
      }
    }
    for (const key of heatmapCache.keys()) {
      if (key.startsWith(prefix)) {
        heatmapCache.delete(key);
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

/**
 * Retorna os dados do mapa de calor (heatmap) do mês para um tenant: pontos
 * agregados por coordenada (somente pedidos geolocalizados) e os contadores de
 * total geral vs. geolocalizados. Escopo por tenant via TenantRepository (R6.1):
 * `tenant_id = $1` é obrigatório nas queries `raw()`.
 *
 * Os pontos são agregados por coordenada arredondada (4 casas ≈ ~11m) para
 * reduzir o payload quando muitos pedidos partem do mesmo local; `weight` é a
 * contagem de pedidos naquele ponto. O heatmap usa só quem tem coordenada, mas
 * `totalOrders` conta TODOS os pedidos do mês (com ou sem localização).
 *
 * Resultados são cacheados por tenant/mês (chave :heatmap), com TTL curto no
 * mês corrente e longo em meses passados.
 */
export async function getMonthlyHeatmap(
  tenantId: string,
  year: number,
  month: number,
): Promise<MonthlyHeatmapResponse> {
  const repo = tenantRepository(tenantId);

  // Serve do cache tenant-scoped quando ainda fresco.
  const cacheKey = getHeatmapCacheKey(tenantId, year, month);
  const cached = heatmapCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  // Contadores: total geral do mês e quantos têm coordenada (tenant_id = $1).
  const countRows = await repo.raw<{ total_orders: number; geolocated_orders: number }>(
    `SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL)::int AS geolocated_orders
    FROM orders
    WHERE tenant_id = $1 AND order_date >= $2 AND order_date <= $3`,
    [tenantId, firstDay, lastDay],
  );

  // Pontos agregados por coordenada arredondada (só geolocalizados).
  const pointRows = await repo.raw<{ lat: string; lng: string; weight: number }>(
    `SELECT
      ROUND(latitude::numeric, 4) AS lat,
      ROUND(longitude::numeric, 4) AS lng,
      COUNT(*)::int AS weight
    FROM orders
    WHERE tenant_id = $1 AND order_date >= $2 AND order_date <= $3
      AND latitude IS NOT NULL AND longitude IS NOT NULL
    GROUP BY ROUND(latitude::numeric, 4), ROUND(longitude::numeric, 4)`,
    [tenantId, firstDay, lastDay],
  );

  const countRow = countRows[0]!;
  const points: HeatmapPoint[] = pointRows.map((row) => ({
    latitude: Number(row.lat),
    longitude: Number(row.lng),
    weight: row.weight,
  }));

  const response: MonthlyHeatmapResponse = {
    year,
    month,
    totalOrders: countRow.total_orders,
    geolocatedOrders: countRow.geolocated_orders,
    points,
  };

  const ttl = isCurrentMonth(year, month) ? CACHE_TTL_CURRENT_MONTH : CACHE_TTL_PAST_MONTH;
  heatmapCache.set(cacheKey, { data: response, expiresAt: Date.now() + ttl });

  return response;
}

// --- Top produtos mais vendidos (ranking único agregado) ---

/** Limite fixo do ranking "Top produtos mais vendidos". */
const TOP_PRODUCTS_LIMIT = 10;

/** Regex de data ISO (YYYY-MM-DD), mesma convenção do resumo diário. */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve a data-alvo do resumo diário: usa `dateParam` se for uma data ISO
 * válida; caso contrário, "hoje" no fuso America/Sao_Paulo (R12.6). Extraído
 * para ser reutilizado pelo ranking diário de produtos sem duplicar a lógica.
 */
function resolveDailyDate(dateParam?: string): string {
  if (dateParam && ISO_DATE_RE.test(dateParam)) {
    return dateParam;
  }
  const zonedDate = toZonedTime(new Date(), SAO_PAULO_TZ);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
}

/** Primeiro e último dia (YYYY-MM-DD) de um dado ano/mês. */
function resolveMonthRange(year: number, month: number): { firstDay: string; lastDay: string } {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
  return { firstDay, lastDay };
}

/**
 * Função interna compartilhada pelos rankings diário e mensal (Opção B): dado
 * um intervalo de datas já resolvido (`fromDate`/`toDate`, inclusivos sobre
 * `order_date`) e uma lista opcional de categorias, retorna o Top N produtos
 * mais vendidos como um ranking ÚNICO AGREGADO.
 *
 * Regras (R — decisões acordadas):
 * - Métrica principal: quantidade vendida (`SUM(oi.quantity)`), com desempate
 *   por faturamento (`SUM(oi.quantity * oi.unit_price_cents)`) desc.
 * - Contabiliza TODOS os pedidos do período (sem filtro de `payment_status`).
 * - `categoryIds` vazio = todas as categorias; não vazio = apenas produtos das
 *   categorias informadas (`mi.category_id = ANY($4::uuid[])`), agregados num
 *   único ranking.
 *
 * Escopo por tenant via TenantRepository (R6.1): `tenant_id = $1` é obrigatório
 * na query `raw()`. O JOIN usa as chaves compostas `(order_id, tenant_id)` e
 * `(menu_item_id, tenant_id)` para não cruzar dados entre tenants.
 */
async function queryTopProducts(
  tenantId: string,
  fromDate: string,
  toDate: string,
  categoryIds: string[],
): Promise<TopProduct[]> {
  const repo = tenantRepository(tenantId);

  const hasCategoryFilter = categoryIds.length > 0;
  // $4 só é referenciado quando há filtro; caso contrário a cláusula some.
  const categoryClause = hasCategoryFilter ? 'AND mi.category_id = ANY($4::uuid[])' : '';
  const params: unknown[] = hasCategoryFilter
    ? [tenantId, fromDate, toDate, categoryIds]
    : [tenantId, fromDate, toDate];

  const rows = await repo.raw<{
    menu_item_id: string;
    name: string;
    category_id: string;
    quantity_sold: number;
    revenue_cents: string;
  }>(
    `SELECT
      oi.menu_item_id AS menu_item_id,
      mi.name AS name,
      mi.category_id AS category_id,
      SUM(oi.quantity)::int AS quantity_sold,
      COALESCE(SUM(oi.quantity * oi.unit_price_cents), 0)::bigint AS revenue_cents
    FROM order_items oi
    JOIN orders o
      ON o.id = oi.order_id AND o.tenant_id = oi.tenant_id
    JOIN menu_items mi
      ON mi.id = oi.menu_item_id AND mi.tenant_id = oi.tenant_id
    WHERE oi.tenant_id = $1
      AND o.order_date >= $2
      AND o.order_date <= $3
      ${categoryClause}
    GROUP BY oi.menu_item_id, mi.name, mi.category_id
    ORDER BY quantity_sold DESC, revenue_cents DESC
    LIMIT ${TOP_PRODUCTS_LIMIT}`,
    params,
  );

  return rows.map((row) => ({
    menuItemId: row.menu_item_id,
    name: row.name,
    categoryId: row.category_id,
    quantitySold: row.quantity_sold,
    revenueCents: Number(row.revenue_cents),
  }));
}

/**
 * Retorna o Top 10 produtos mais vendidos de um DIA para um tenant. Se `date`
 * não for uma data ISO válida, usa hoje no fuso America/Sao_Paulo (R12.6).
 * O filtro `categoryIds` (multi-seleção) é opcional; vazio = todas.
 */
export async function getDailyTopProducts(
  tenantId: string,
  options: { date?: string; categoryIds?: string[] } = {},
): Promise<TopProductsResponse> {
  const targetDate = resolveDailyDate(options.date);
  const categoryIds = options.categoryIds ?? [];
  const products = await queryTopProducts(tenantId, targetDate, targetDate, categoryIds);
  return { products, categoryIds };
}

/**
 * Retorna o Top 10 produtos mais vendidos de um MÊS para um tenant. O filtro
 * `categoryIds` (multi-seleção) é opcional; vazio = todas.
 */
export async function getMonthlyTopProducts(
  tenantId: string,
  options: { year: number; month: number; categoryIds?: string[] },
): Promise<TopProductsResponse> {
  const { firstDay, lastDay } = resolveMonthRange(options.year, options.month);
  const categoryIds = options.categoryIds ?? [];
  const products = await queryTopProducts(tenantId, firstDay, lastDay, categoryIds);
  return { products, categoryIds };
}
