import { type Response } from 'express';
import { publicCreateOrderSchema } from '@order-system/shared';
import type { ThemeConfig } from '@order-system/shared';
import { pool } from '../config/database.js';
import * as menuService from '../services/menu.service.js';
import { createOrder, getOrderById, getOrdersByIds } from '../services/order.service.js';
import type { PublicTenantRequest } from '../middleware/public-tenant.middleware.js';
import { NEUTRAL_PLATFORM_THEME, deepMergeTheme } from '../theme/platform-theme.js';
import { sendError } from '../http/send-error.js';
import { logError } from '../http/log-error.js';

/**
 * Public (unauthenticated) controllers for the customer ordering flow.
 *
 * These handlers back the routes mounted under `/api/public/:slug/*`. The
 * tenant is already resolved by `publicTenantMiddleware`, which sets
 * `req.tenantId` / `req.tenantSlug` — the handlers below never re-derive the
 * tenant from user auth (there is none) and never leak internal tenant fields.
 *
 * Design: `.kiro/specs/customer-ordering/design.md`
 *   → "Controller: src/controllers/public.controller.ts".
 *
 * NOTE ON DTO TYPES: the shared public types (`PublicMenuItem`,
 * `PublicMenuCategory`, `PublicBranding`) are introduced by Task 7 in
 * `@order-system/shared`. Until that lands, the equivalent shapes are declared
 * locally here so the response contract matches the design exactly. When Task 7
 * ships, these can be replaced by the shared imports without changing behavior.
 */

// --- Public DTO shapes (mirror @order-system/shared → types/public.ts) ---

interface PublicMenuItem {
  id: string;
  name: string;
  priceCents: number;
  categoryName: string;
}

interface PublicMenuCategory {
  name: string;
  sortOrder: number;
  items: PublicMenuItem[];
}

interface PublicBranding {
  businessName: string;
  logoUrl: string | null;
  /**
   * Fully-resolved theme: the tenant's partial `theme` override merged over the
   * neutral platform theme, so every token has a value. Mirrors the
   * authenticated `GET /api/tenant/branding` contract so the customer app and
   * the operator app render with identical colors (single source of truth).
   */
  theme: ThemeConfig;
  slug: string;
  realtimeChannel: string;
}

interface BrandingRow {
  business_name: string;
  logo_url: string | null;
  theme: Partial<ThemeConfig> | null;
  provisioning_key: string;
}

// Public order-status DTO (mirror @order-system/shared → types/public.ts →
// PublicOrderResponse). `orderDate` is intentionally omitted here: Task 6's
// field list for the status response does not include it.
interface PublicOrderStatusItem {
  itemName: string;
  quantity: number;
  unitPriceCents: number;
}

interface PublicOrderStatus {
  id: string;
  dailyNumber: number;
  customerName: string;
  status: string;
  paymentStatus: string;
  origin: string;
  totalAmountCents: number;
  createdAt: string;
  items: PublicOrderStatusItem[];
}

/**
 * GET /api/public/:slug/branding (R5)
 *
 * Returns only the public-facing identity of the tenant. Uses the shared
 * `pool` because the lookup is by tenant id (platform-level, matching the
 * resolution middleware) rather than tenant-scoped domain data.
 *
 * Does NOT expose the raw UUID, `evolution_instance_name` or `whatsapp_config`
 * (R5.3). The `slug` is the `provisioning_key`, and the realtime channel is
 * returned pre-built so the client never has to construct it from the tenant
 * UUID.
 */
export async function publicBrandingController(
  req: PublicTenantRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.tenantId as string;

  try {
    const result = await pool.query(
      `SELECT business_name, logo_url, theme, provisioning_key
       FROM tenants
       WHERE id = $1`,
      [tenantId],
    );

    const row = result.rows[0] as BrandingRow | undefined;

    // The middleware already confirmed the tenant is active; a miss here would
    // only happen on a race (tenant deleted mid-request). Treat as not found.
    if (!row) {
      sendError(res, 404, 'TENANT_NOT_FOUND', 'Estabelecimento não encontrado.');
      return;
    }

    const branding: PublicBranding = {
      businessName: row.business_name,
      logoUrl: row.logo_url,
      // Merge the tenant's partial override over the neutral platform theme so
      // the response is a complete ThemeConfig — same resolution the
      // authenticated branding endpoint uses (branding.service.ts).
      theme: deepMergeTheme(NEUTRAL_PLATFORM_THEME, row.theme),
      slug: row.provisioning_key,
      realtimeChannel: `orders:queue:${tenantId}`,
    };

    res.status(200).json(branding);
  } catch (err) {
    logError('public:branding', err, req);
    sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao carregar o estabelecimento.');
  }
}

/**
 * GET /api/public/:slug/menu (R2)
 *
 * Reuses `menuService.getMenu(tenantId, false)` — the SAME service the
 * authenticated menu endpoint uses. `getMenu(false)` already filters out
 * inactive items AND inactive categories, and returns categories pre-sorted by
 * `sortOrder`. Nothing from the WhatsApp bot is involved.
 *
 * The internal `MenuGroup`/`MenuItemRecord` shape is mapped to the public DTO:
 *   - `price` → `priceCents`
 *   - internal fields (`status`, `createdAt`, `updatedAt`) are dropped
 *   - `sortOrder` is preserved per category (R2.4)
 * `description` is intentionally absent (no such column in the schema).
 */
export async function publicMenuController(
  req: PublicTenantRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.tenantId as string;

  try {
    const groups = await menuService.getMenu(tenantId, false);

    const categories: PublicMenuCategory[] = groups.map((group) => ({
      name: group.category,
      sortOrder: group.sortOrder,
      items: group.items.map((item) => ({
        id: item.id,
        name: item.name,
        priceCents: item.price,
        categoryName: item.category,
      })),
    }));

    res.status(200).json(categories);
  } catch (err) {
    logError('public:menu', err, req);
    sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao carregar o cardápio.');
  }
}

/**
 * POST /api/public/:slug/orders (R3, R8, R10, R11)
 *
 * Creates an online order (origin `'web'`) on behalf of an unauthenticated
 * customer. The tenant is already resolved by `publicTenantMiddleware`.
 *
 * Flow:
 *   1. Validate the body with `publicCreateOrderSchema` (`.strict()`): unknown
 *      fields or malformed shapes are rejected with 400 (R11.4). The client
 *      never sends `origin` or the total — both are enforced server-side.
 *   2. Resolve the tenant's first active admin as `created_by` (R3.7). Orders
 *      require an owner; if the tenant has no active admin, the storefront is
 *      not operational → 422 `TENANT_UNAVAILABLE`.
 *   3. Delegate to the shared `createOrder(tenantId, ...)` service — the SAME
 *      one the authenticated app uses. It validates items against the tenant,
 *      snapshots prices, runs the insert in a transaction, allocates the daily
 *      number and broadcasts the `new_order` realtime event so the operator
 *      sees it immediately.
 *   4. Return only the customer-facing fields of the created order.
 *
 * Errors from the service surface a numeric `.statusCode` (e.g. 422 for an
 * invalid/inactive item, 409 for a daily-number conflict). We map by that code
 * rather than `instanceof` so a 500 never leaks (design.md).
 */
export async function publicCreateOrderController(
  req: PublicTenantRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.tenantId as string;

  // 1. Strict body validation (R11.4). Reject early with 400 on any deviation.
  const parsed = publicCreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    // Envelope padrão + `details` do Zod preservado para diagnóstico do cliente.
    res.status(400).json({
      statusCode: 400,
      error: 'INVALID_REQUEST',
      message: 'Dados do pedido inválidos.',
      details: parsed.error.flatten(),
    });
    return;
  }

  const { customerName, items } = parsed.data;

  try {
    // 2. The order needs an owner. Use the tenant's oldest active admin.
    const adminResult = await pool.query(
      `SELECT id FROM users
       WHERE tenant_id = $1 AND role = 'admin' AND status = 'ativo'
       ORDER BY created_at ASC
       LIMIT 1`,
      [tenantId],
    );

    const admin = adminResult.rows[0] as { id: string } | undefined;
    if (!admin) {
      sendError(res, 422, 'TENANT_UNAVAILABLE', 'Estabelecimento indisponível no momento.');
      return;
    }

    // 3. Reuse the shared order service — origin is forced to 'web' here.
    const created = await createOrder(tenantId, {
      customerName,
      origin: 'web',
      items,
      createdBy: admin.id,
    });

    // 4. Return the full public order shape (PublicOrderResponse) so the
    //    client can persist a complete "Meus Pedidos" entry and render the
    //    order card without a second fetch. Must include customerName,
    //    paymentStatus and items — the customer order card relies on all three.
    res.status(201).json({
      id: created.id,
      dailyNumber: created.dailyNumber,
      customerName: created.customerName,
      status: created.status,
      paymentStatus: created.paymentStatus,
      origin: created.origin,
      totalAmountCents: created.totalAmountCents,
      orderDate: created.orderDate,
      createdAt: created.createdAt,
      items: (created.items ?? []).map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    });
  } catch (err) {
    // Mapeia erros do service pelo `.statusCode` numérico (o contrato público é
    // o status, não a classe). Preservamos o `code` já exposto (ex.:
    // VALIDATION_ERROR para item inválido, CONFLICT para conflito de
    // numeração), mas usamos uma `message` pública genérica — a mensagem
    // interna do service NÃO é repassada ao cliente anônimo.
    if (
      err &&
      typeof err === 'object' &&
      'statusCode' in err &&
      typeof (err as { statusCode: unknown }).statusCode === 'number'
    ) {
      const statusCode = (err as { statusCode: number }).statusCode;
      const code = (err as { code?: string }).code ?? 'VALIDATION_ERROR';
      const message =
        statusCode === 409
          ? 'Não foi possível registrar o pedido. Tente novamente.'
          : 'Não foi possível criar o pedido. Verifique os itens e tente novamente.';
      sendError(res, statusCode, code, message);
      return;
    }

    logError('public:create-order', err, req);
    sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao criar o pedido.');
  }
}

/**
 * GET /api/public/:slug/orders/:orderId (R4)
 *
 * Returns the current status of a single order so the customer can track it
 * without authentication. The tenant is already resolved by
 * `publicTenantMiddleware`, and `getOrderById(tenantId, orderId)` is scoped to
 * that tenant — an order from another tenant is treated as not existing.
 *
 * `getOrderById` throws a `ServiceError` whose `.statusCode` is 404 when the
 * order does not exist (or belongs to another tenant). We map by inspecting
 * `.statusCode` (NOT `instanceof`), because each service defines its own
 * `ServiceError` class and the shared contract is the numeric status code
 * (design.md → "try/catch mapeando pela propriedade .statusCode do erro").
 *
 * The response exposes only customer-facing fields. `paymentStatus`
 * ('pendente' | 'pago') IS included so the tracking screen can show whether the
 * order is paid — this is information the customer already knows. Truly internal
 * fields (`created_by`, `payment_method`, and per-item internal ids) are never
 * included.
 */
export async function publicOrderStatusController(
  req: PublicTenantRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.tenantId as string;
  const orderId = req.params.orderId as string;

  try {
    const order = await getOrderById(tenantId, orderId);

    const payload: PublicOrderStatus = {
      id: order.id,
      dailyNumber: order.dailyNumber,
      customerName: order.customerName,
      status: order.status,
      paymentStatus: order.paymentStatus,
      origin: order.origin,
      totalAmountCents: order.totalAmountCents,
      createdAt: order.createdAt,
      items: (order.items ?? []).map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    };

    res.status(200).json(payload);
  } catch (err) {
    // Mapeia pelo status numérico, não por instanceof. Traduz o código interno
    // (NOT_FOUND) para o código PÚBLICO (ORDER_NOT_FOUND) — contrato público
    // estável e intencional (design.md).
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: unknown }).statusCode === 404) {
      sendError(res, 404, 'ORDER_NOT_FOUND', 'Pedido não encontrado.');
      return;
    }

    logError('public:order-status', err, req);
    sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao consultar o pedido.');
  }
}

/** Max order ids accepted per batch request (public surface — keep bounded). */
const MAX_BATCH_IDS = 50;

/** Loose UUID v1-v5 matcher — rejects obviously malformed ids before hitting the DB. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/public/:slug/orders?ids=a,b,c (batch tracking)
 *
 * Returns the full public shape for several orders in ONE request, so the
 * customer "Meus Pedidos" screen avoids the N+1 fetch it did before (one call
 * per session order). Follows the operator listing convention (`getOrders`):
 * a GET with a comma-separated query param, accepting either a repeated param
 * (`?ids=a&ids=b`) or a single comma string (`?ids=a,b`).
 *
 * Ids that don't exist or belong to another tenant are silently omitted (same
 * tolerant behavior as the per-id tracker). Invalid input rules:
 *   - missing/empty `ids` → 400 INVALID_REQUEST
 *   - more than MAX_BATCH_IDS → 400 TOO_MANY_IDS
 *   - any id not matching the UUID format → 400 INVALID_REQUEST
 */
export async function publicOrdersBatchController(
  req: PublicTenantRequest,
  res: Response,
): Promise<void> {
  const tenantId = req.tenantId as string;

  // Parse `ids` accepting both a repeated param and a comma-separated string
  // (mirrors the operator getOrders controller).
  const raw = req.query.ids;
  let ids: string[] = [];
  if (Array.isArray(raw)) {
    ids = raw.flatMap((v) => (typeof v === 'string' ? v.split(',') : []));
  } else if (typeof raw === 'string') {
    ids = raw.split(',');
  }
  ids = ids.map((s) => s.trim()).filter(Boolean);
  // De-duplicate while preserving order.
  ids = [...new Set(ids)];

  if (ids.length === 0) {
    sendError(res, 400, 'INVALID_REQUEST', 'Nenhum pedido informado.');
    return;
  }

  if (ids.length > MAX_BATCH_IDS) {
    sendError(res, 400, 'TOO_MANY_IDS', 'Muitos pedidos informados de uma só vez.');
    return;
  }

  if (!ids.every((id) => UUID_RE.test(id))) {
    sendError(res, 400, 'INVALID_REQUEST', 'Identificadores de pedido inválidos.');
    return;
  }

  try {
    const orders = await getOrdersByIds(tenantId, ids);

    // Same public projection as the single-order status endpoint, one per order.
    const payload: PublicOrderStatus[] = orders.map((order) => ({
      id: order.id,
      dailyNumber: order.dailyNumber,
      customerName: order.customerName,
      status: order.status,
      paymentStatus: order.paymentStatus,
      origin: order.origin,
      totalAmountCents: order.totalAmountCents,
      createdAt: order.createdAt,
      items: (order.items ?? []).map((item) => ({
        itemName: item.itemName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    }));

    res.status(200).json(payload);
  } catch (err) {
    logError('public:orders-batch', err, req);
    sendError(res, 500, 'INTERNAL_ERROR', 'Erro ao consultar os pedidos.');
  }
}
