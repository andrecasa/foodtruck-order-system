import type { OrderStatus } from '@order-system/shared';
import { isValidTransition } from '@order-system/shared';
import { tenantRepository } from '../db/tenant-repository.js';
import {
  broadcast,
  tenantChannel,
  REALTIME_CHANNEL_QUEUE,
  REALTIME_CHANNEL_PAYMENT,
} from '../config/realtime.js';
import { toZonedTime, format } from 'date-fns-tz';

// --- Constants ---

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * Map of status transitions to their corresponding timestamp fields.
 */
const TRANSITION_TIMESTAMP_FIELD: Record<string, string> = {
  'aguardando→preparando': 'started_at',
  'preparando→pronto': 'ready_at',
  'pronto→entregue': 'delivered_at',
};

// --- Interfaces ---

export interface OrderItemInput {
  menuItemId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  origin: string;
  items: OrderItemInput[];
  createdBy: string;
}

export interface OrderItemRecord {
  id: string;
  menuItemId: string;
  itemName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface OrderRecord {
  id: string;
  dailyNumber: number;
  customerName: string;
  origin: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmountCents: number;
  orderDate: string;
  createdAt: string;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  paidAt: string | null;
  items?: OrderItemRecord[];
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

// --- Helpers ---

/** Resolve the order date in São Paulo timezone (yyyy-MM-dd). */
function resolveOrderDate(date?: string): string {
  if (date) return date;
  const now = new Date();
  const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
  return format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });
}

// --- Service functions ---

/**
 * Lists orders for today, optionally filtered by status. All access is scoped
 * to `tenantId`; orders belonging to other tenants are never returned (R6.1).
 */
export async function getOrders(tenantId: string, statuses: string[], date?: string): Promise<OrderRecord[]> {
  const repo = tenantRepository(tenantId);
  const orderDate = resolveOrderDate(date);

  let ordersRows: Record<string, unknown>[];

  // tenant_id is $1 (required by raw()); other predicates are renumbered from $2.
  if (statuses.length > 0) {
    ordersRows = await repo.raw<Record<string, unknown>>(
      `SELECT o.id, o.daily_number, o.customer_name, o.origin, o.status, o.payment_status,
              o.payment_method, o.total_amount_cents, o.order_date, o.created_at,
              o.started_at, o.ready_at, o.delivered_at, o.paid_at
       FROM orders o
       WHERE o.tenant_id = $1 AND o.order_date = $2 AND o.status = ANY($3::text[])
       ORDER BY o.created_at ASC`,
      [tenantId, orderDate, statuses],
    );
  } else {
    ordersRows = await repo.raw<Record<string, unknown>>(
      `SELECT o.id, o.daily_number, o.customer_name, o.origin, o.status, o.payment_status,
              o.payment_method, o.total_amount_cents, o.order_date, o.created_at,
              o.started_at, o.ready_at, o.delivered_at, o.paid_at
       FROM orders o
       WHERE o.tenant_id = $1 AND o.order_date = $2
       ORDER BY o.created_at ASC`,
      [tenantId, orderDate],
    );
  }

  // Fetch items for all orders (scoped to the tenant).
  const orderIds = ordersRows.map((o) => o.id);
  const itemsMap: Record<string, OrderItemRecord[]> = {};

  if (orderIds.length > 0) {
    const itemsRows = await repo.raw<Record<string, unknown>>(
      `SELECT id, order_id, menu_item_id, item_name, unit_price_cents, quantity
       FROM order_items WHERE tenant_id = $1 AND order_id = ANY($2::uuid[])`,
      [tenantId, orderIds],
    );
    for (const item of itemsRows) {
      const orderId = item.order_id as string;
      if (!itemsMap[orderId]) itemsMap[orderId] = [];
      itemsMap[orderId]!.push({
        id: item.id as string,
        menuItemId: item.menu_item_id as string,
        itemName: item.item_name as string,
        unitPriceCents: item.unit_price_cents as number,
        quantity: item.quantity as number,
      });
    }
  }

  return ordersRows.map((o) => ({
    id: o.id as string,
    dailyNumber: o.daily_number as number,
    customerName: o.customer_name as string,
    origin: o.origin as string,
    status: o.status as string,
    paymentStatus: o.payment_status as string,
    paymentMethod: o.payment_method as string | null,
    totalAmountCents: o.total_amount_cents as number,
    orderDate: o.order_date as string,
    createdAt: o.created_at as string,
    startedAt: o.started_at as string | null,
    readyAt: o.ready_at as string | null,
    deliveredAt: o.delivered_at as string | null,
    paidAt: o.paid_at as string | null,
    items: itemsMap[o.id as string] || [],
  }));
}

/**
 * Gets a single order by ID with its items, scoped to the tenant. An order
 * belonging to another tenant is treated as not existing → 404 (R6.3).
 */
export async function getOrderById(tenantId: string, orderId: string): Promise<OrderRecord> {
  const repo = tenantRepository(tenantId);

  const o = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!o) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  const itemsRows = await repo.select<Record<string, unknown>>('order_items', {
    where: { text: `order_id = $1`, params: [orderId] },
  });

  const items: OrderItemRecord[] = itemsRows.map((i) => ({
    id: i.id as string,
    menuItemId: i.menu_item_id as string,
    itemName: i.item_name as string,
    unitPriceCents: i.unit_price_cents as number,
    quantity: i.quantity as number,
  }));

  return {
    id: o.id as string,
    dailyNumber: o.daily_number as number,
    customerName: o.customer_name as string,
    origin: o.origin as string,
    status: o.status as string,
    paymentStatus: o.payment_status as string,
    paymentMethod: o.payment_method as string | null,
    totalAmountCents: o.total_amount_cents as number,
    orderDate: o.order_date as string,
    createdAt: o.created_at as string,
    startedAt: o.started_at as string | null,
    readyAt: o.ready_at as string | null,
    deliveredAt: o.delivered_at as string | null,
    paidAt: o.paid_at as string | null,
    items,
  };
}

/**
 * Creates a new order with price snapshots and tenant-scoped sequential
 * numbering. Validates all menu items exist and are active within the tenant.
 * Uses `next_daily_number($tenantId, $date)` and inserts `tenant_id` on both
 * the order and its items (R3.2, R3.7).
 */
export async function createOrder(tenantId: string, input: CreateOrderInput): Promise<OrderRecord> {
  const { customerName, origin, items, createdBy } = input;
  const repo = tenantRepository(tenantId);

  // Validate all menu items exist and are active within the tenant.
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuItems = await repo.raw<Record<string, unknown>>(
    `SELECT id, name, price_cents, status FROM menu_items
     WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, menuItemIds],
  );

  if (!menuItems || menuItems.length === 0) {
    throw new ServiceError('Item não encontrado ou inativo', 422, 'VALIDATION_ERROR');
  }

  for (const item of items) {
    const menuItem = menuItems.find((mi) => mi.id === item.menuItemId);
    if (!menuItem || menuItem.status !== 'ativo') {
      throw new ServiceError('Item não encontrado ou inativo', 422, 'VALIDATION_ERROR');
    }
  }

  // Calculate total and prepare order items with price snapshots.
  const orderItems = items.map((item) => {
    const menuItem = menuItems.find((mi) => mi.id === item.menuItemId)!;
    return {
      menuItemId: item.menuItemId,
      itemName: menuItem.name as string,
      unitPriceCents: menuItem.price_cents as number,
      quantity: item.quantity,
    };
  });

  const totalAmountCents = orderItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );

  const orderDate = resolveOrderDate();
  const now = new Date().toISOString();

  try {
    const created = await repo.withTransaction(async (txRepo) => {
      // Get next daily number scoped to (tenant_id, order_date).
      const seqRows = await txRepo.raw<{ daily_number: number }>(
        'SELECT next_daily_number($1::uuid, $2::date) AS daily_number',
        [tenantId, orderDate],
      );
      const dailyNumber = seqRows[0]!.daily_number;

      // Insert order (tenant_id injected by the repository).
      const order = await txRepo.insert<Record<string, unknown>>('orders', {
        daily_number: dailyNumber,
        customer_name: customerName,
        origin,
        status: 'aguardando',
        payment_status: 'pendente',
        total_amount_cents: totalAmountCents,
        order_date: orderDate,
        created_by: createdBy,
        created_at: now,
      });

      // Insert order items (tenant_id injected by the repository).
      const insertedItems: OrderItemRecord[] = [];
      for (const item of orderItems) {
        const row = await txRepo.insert<Record<string, unknown>>('order_items', {
          order_id: order.id,
          menu_item_id: item.menuItemId,
          item_name: item.itemName,
          unit_price_cents: item.unitPriceCents,
          quantity: item.quantity,
        });
        insertedItems.push({
          id: row.id as string,
          menuItemId: row.menu_item_id as string,
          itemName: row.item_name as string,
          unitPriceCents: row.unit_price_cents as number,
          quantity: row.quantity as number,
        });
      }

      const createdOrder: OrderRecord = {
        id: order.id as string,
        dailyNumber: order.daily_number as number,
        customerName: order.customer_name as string,
        origin: order.origin as string,
        status: order.status as string,
        paymentStatus: order.payment_status as string,
        paymentMethod: null,
        totalAmountCents: order.total_amount_cents as number,
        orderDate: order.order_date as string,
        createdAt: order.created_at as string,
        startedAt: null,
        readyAt: null,
        deliveredAt: null,
        paidAt: null,
        items: insertedItems,
      };

      return createdOrder;
    });

    // Publish event to the tenant-namespaced queue channel (fire and forget).
    // Only subscribers of this tenant's channel receive it (R12.7, R12.8).
    broadcast(tenantChannel(REALTIME_CHANNEL_QUEUE, tenantId), 'new_order', { ...created, tenantId });

    return created;
  } catch (txError: unknown) {
    // Handle unique constraint violation on the composite daily-number index
    // orders_tenant_date_number_idx (R3.7).
    if (
      txError instanceof Error &&
      'code' in txError &&
      (txError as Record<string, unknown>).code === '23505' &&
      'constraint' in txError &&
      ((txError as Record<string, unknown>).constraint as string)?.includes('daily_number')
    ) {
      throw new ServiceError('Conflito de numeração, tente novamente', 409, 'CONFLICT');
    }

    throw txError;
  }
}

/**
 * Updates order status with transition validation and timestamp tracking.
 * Scoped to the tenant: an order of another tenant is treated as not existing
 * → 404 (R6.4). Invalid transitions → 422 (R12.2).
 */
export async function updateOrderStatus(tenantId: string, orderId: string, newStatus: OrderStatus): Promise<OrderRecord> {
  const repo = tenantRepository(tenantId);

  const order = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!order) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  const currentStatus = order.status as OrderStatus;

  // Validate transition
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new ServiceError('Transição de status inválida', 422, 'VALIDATION_ERROR');
  }

  // Determine timestamp field to set
  const transitionKey = `${currentStatus}→${newStatus}`;
  const timestampField = TRANSITION_TIMESTAMP_FIELD[transitionKey]!;
  const now = new Date().toISOString();

  // Update order (scoped to tenant).
  await repo.update(
    'orders',
    { status: newStatus, [timestampField]: now },
    { text: `id = $1`, params: [orderId] },
  );

  const updatedOrder = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!updatedOrder) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  const responsePayload: OrderRecord = {
    id: updatedOrder.id as string,
    dailyNumber: updatedOrder.daily_number as number,
    customerName: updatedOrder.customer_name as string,
    origin: updatedOrder.origin as string,
    status: updatedOrder.status as string,
    paymentStatus: updatedOrder.payment_status as string,
    paymentMethod: (updatedOrder.payment_method as string | null) ?? null,
    totalAmountCents: updatedOrder.total_amount_cents as number,
    orderDate: updatedOrder.order_date as string,
    createdAt: updatedOrder.created_at as string,
    startedAt: updatedOrder.started_at as string | null,
    readyAt: updatedOrder.ready_at as string | null,
    deliveredAt: updatedOrder.delivered_at as string | null,
    paidAt: (updatedOrder.paid_at as string | null) ?? null,
  };

  // Publish event to the tenant-namespaced queue channel (R12.7, R12.8).
  broadcast(tenantChannel(REALTIME_CHANNEL_QUEUE, tenantId), 'status_updated', { ...responsePayload, tenantId });

  return responsePayload;
}

/**
 * Registers payment for an order. Scoped to the tenant: an order of another
 * tenant is treated as not existing → 404 (R6.4). Applies the MVP payment
 * rules (R12.3).
 */
export async function registerPayment(tenantId: string, orderId: string, paymentMethod: string): Promise<OrderRecord> {
  const repo = tenantRepository(tenantId);

  const order = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!order) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  // Check if already paid
  if (order.payment_status === 'pago') {
    throw new ServiceError('Pedido já foi pago', 409, 'CONFLICT');
  }

  // Update payment info (scoped to tenant).
  const now = new Date().toISOString();
  await repo.update(
    'orders',
    { payment_status: 'pago', payment_method: paymentMethod, paid_at: now },
    { text: `id = $1`, params: [orderId] },
  );

  const updatedOrder = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!updatedOrder) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  const responsePayload: OrderRecord = {
    id: updatedOrder.id as string,
    dailyNumber: updatedOrder.daily_number as number,
    customerName: updatedOrder.customer_name as string,
    origin: updatedOrder.origin as string,
    status: updatedOrder.status as string,
    paymentStatus: updatedOrder.payment_status as string,
    paymentMethod: updatedOrder.payment_method as string | null,
    totalAmountCents: updatedOrder.total_amount_cents as number,
    orderDate: updatedOrder.order_date as string,
    createdAt: updatedOrder.created_at as string,
    startedAt: updatedOrder.started_at as string | null,
    readyAt: updatedOrder.ready_at as string | null,
    deliveredAt: updatedOrder.delivered_at as string | null,
    paidAt: updatedOrder.paid_at as string | null,
  };

  // Publish event to the tenant-namespaced payment channel (R12.7, R12.8).
  broadcast(tenantChannel(REALTIME_CHANNEL_PAYMENT, tenantId), 'payment_registered', { ...responsePayload, tenantId });

  // Also publish a lightweight payment update on the QUEUE channel. Public
  // customer clients subscribe to the queue channel (not the payment channel),
  // so this lets the tracking screen reflect "Pago" in real time without
  // granting public clients access to the operator's payment channel.
  broadcast(tenantChannel(REALTIME_CHANNEL_QUEUE, tenantId), 'payment_registered', {
    id: responsePayload.id,
    paymentStatus: responsePayload.paymentStatus,
    tenantId,
  });

  return responsePayload;
}

/**
 * Updates order items (full replacement) for orders in 'aguardando' status.
 * Scoped to the tenant: an order of another tenant is treated as not existing
 * → 404 (R6.4). Validates all menu items exist and are active, no duplicates.
 */
export async function updateOrderItems(tenantId: string, orderId: string, items: OrderItemInput[], customerName?: string, origin?: string): Promise<OrderRecord> {
  const repo = tenantRepository(tenantId);

  // Check for duplicate menuItemIds
  const menuItemIds = items.map((i) => i.menuItemId);
  const uniqueIds = new Set(menuItemIds);
  if (uniqueIds.size !== menuItemIds.length) {
    throw new ServiceError('Itens duplicados não são permitidos', 422, 'VALIDATION_ERROR');
  }

  // Look up order by ID within the tenant.
  const order = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!order) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  // Check if order has already been paid
  if (order.payment_status === 'pago') {
    throw new ServiceError('Pedido não pode ser editado após o pagamento', 422, 'VALIDATION_ERROR');
  }

  // Validate all menu items exist and are active within the tenant.
  const menuItems = await repo.raw<Record<string, unknown>>(
    `SELECT id, name, price_cents, status FROM menu_items
     WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
    [tenantId, menuItemIds],
  );

  for (const item of items) {
    const menuItem = menuItems.find((mi) => mi.id === item.menuItemId);
    if (!menuItem || menuItem.status !== 'ativo') {
      throw new ServiceError('Item não encontrado ou inativo', 422, 'VALIDATION_ERROR');
    }
  }

  // Execute transaction: DELETE old → INSERT new → UPDATE total (scoped to tenant).
  const insertedItems = await repo.withTransaction(async (txRepo) => {
    // Delete old order items
    await txRepo.delete('order_items', { text: `order_id = $1`, params: [orderId] });

    // Insert new order items with price snapshots.
    const newItems: OrderItemRecord[] = [];
    for (const item of items) {
      const menuItem = menuItems.find((mi) => mi.id === item.menuItemId)!;
      const row = await txRepo.insert<Record<string, unknown>>('order_items', {
        order_id: orderId,
        menu_item_id: item.menuItemId,
        item_name: menuItem.name as string,
        unit_price_cents: menuItem.price_cents as number,
        quantity: item.quantity,
      });
      newItems.push({
        id: row.id as string,
        menuItemId: row.menu_item_id as string,
        itemName: row.item_name as string,
        unitPriceCents: row.unit_price_cents as number,
        quantity: row.quantity as number,
      });
    }

    // Calculate new total.
    const total = newItems.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

    // Update order total (and optionally customerName/origin).
    const set: Record<string, unknown> = { total_amount_cents: total };
    if (customerName !== undefined) set.customer_name = customerName;
    if (origin !== undefined) set.origin = origin;

    await txRepo.update('orders', set, { text: `id = $1`, params: [orderId] });

    return newItems;
  });

  const totalAmountCents = insertedItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );

  const updatedOrder: OrderRecord = {
    id: order.id as string,
    dailyNumber: order.daily_number as number,
    customerName: customerName ?? (order.customer_name as string),
    origin: origin ?? (order.origin as string),
    status: order.status as string,
    paymentStatus: order.payment_status as string,
    paymentMethod: order.payment_method as string | null,
    totalAmountCents,
    orderDate: order.order_date as string,
    createdAt: order.created_at as string,
    startedAt: order.started_at as string | null,
    readyAt: order.ready_at as string | null,
    deliveredAt: order.delivered_at as string | null,
    paidAt: order.paid_at as string | null,
    items: insertedItems,
  };

  // Broadcast order_updated on the tenant-namespaced queue channel (R12.7, R12.8).
  broadcast(tenantChannel(REALTIME_CHANNEL_QUEUE, tenantId), 'order_updated', { ...updatedOrder, tenantId });

  return updatedOrder;
}

/**
 * Deletes an order by ID within the tenant. order_items are automatically
 * removed via ON DELETE CASCADE. An order of another tenant is treated as not
 * existing → 404 (R6.4). Broadcasts an order_deleted event.
 */
export async function deleteOrder(tenantId: string, orderId: string): Promise<void> {
  const repo = tenantRepository(tenantId);

  // Look up order to verify it exists within the tenant.
  const order = await repo.findOne<Record<string, unknown>>('orders', {
    where: { text: `id = $1`, params: [orderId] },
  });

  if (!order) {
    throw new ServiceError('Pedido não encontrado', 404, 'NOT_FOUND');
  }

  // Delete order (order_items cascade automatically); scoped to tenant.
  await repo.delete('orders', { text: `id = $1`, params: [orderId] });

  // Broadcast deletion on the tenant-namespaced queue channel (R12.7, R12.8).
  broadcast(tenantChannel(REALTIME_CHANNEL_QUEUE, tenantId), 'order_deleted', { id: orderId, tenantId });
}
