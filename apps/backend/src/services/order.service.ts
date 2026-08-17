import type { OrderStatus } from '@order-system/shared';
import { isValidTransition } from '@order-system/shared';
import { pool } from '../config/database.js';
import { broadcast } from '../config/realtime.js';
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

// --- Service functions ---

/**
 * Lists orders for today, optionally filtered by status.
 */
export async function getOrders(statuses: string[]): Promise<OrderRecord[]> {
  // Get today's date in São Paulo timezone
  const now = new Date();
  const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
  const today = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

  let query: string;
  let params: unknown[];

  if (statuses.length > 0) {
    query = `
      SELECT o.id, o.daily_number, o.customer_name, o.origin, o.status, o.payment_status,
             o.payment_method, o.total_amount_cents, o.order_date, o.created_at,
             o.started_at, o.ready_at, o.delivered_at, o.paid_at
      FROM orders o
      WHERE o.order_date = $1 AND o.status = ANY($2::text[])
      ORDER BY o.created_at ASC
    `;
    params = [today, statuses];
  } else {
    query = `
      SELECT o.id, o.daily_number, o.customer_name, o.origin, o.status, o.payment_status,
             o.payment_method, o.total_amount_cents, o.order_date, o.created_at,
             o.started_at, o.ready_at, o.delivered_at, o.paid_at
      FROM orders o
      WHERE o.order_date = $1
      ORDER BY o.created_at ASC
    `;
    params = [today];
  }

  const ordersResult = await pool.query(query, params);

  // Fetch items for all orders
  const orderIds = ordersResult.rows.map((o: Record<string, unknown>) => o.id);
  let itemsMap: Record<string, OrderItemRecord[]> = {};

  if (orderIds.length > 0) {
    const itemsResult = await pool.query(
      `SELECT id, order_id, menu_item_id, item_name, unit_price_cents, quantity
       FROM order_items WHERE order_id = ANY($1::uuid[])`,
      [orderIds]
    );
    for (const item of itemsResult.rows) {
      if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
      itemsMap[item.order_id]!.push({
        id: item.id,
        menuItemId: item.menu_item_id,
        itemName: item.item_name,
        unitPriceCents: item.unit_price_cents,
        quantity: item.quantity,
      });
    }
  }

  return ordersResult.rows.map((o: Record<string, unknown>) => ({
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
 * Creates a new order with price snapshots and sequential numbering.
 * Validates all menu items exist and are active.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderRecord> {
  const { customerName, origin, items } = input;

  // Validate all menu items exist and are active
  const menuItemIds = items.map((i) => i.menuItemId);
  const menuResult = await pool.query(
    `SELECT id, name, price_cents, status FROM menu_items WHERE id = ANY($1::uuid[])`,
    [menuItemIds]
  );
  const menuItems = menuResult.rows;

  if (!menuItems || menuItems.length === 0) {
    throw new ServiceError(
      'Item não encontrado ou inativo',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Check all items exist and are active
  for (const item of items) {
    const menuItem = menuItems.find((mi: Record<string, unknown>) => mi.id === item.menuItemId);
    if (!menuItem || menuItem.status !== 'ativo') {
      throw new ServiceError(
        'Item não encontrado ou inativo',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // Calculate total and prepare order items with snapshots
  const orderItems = items.map((item) => {
    const menuItem = menuItems.find((mi: Record<string, unknown>) => mi.id === item.menuItemId)!;
    return {
      menuItemId: item.menuItemId,
      itemName: menuItem.name as string,
      unitPriceCents: menuItem.price_cents as number,
      quantity: item.quantity,
    };
  });

  const totalAmountCents = orderItems.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );

  // Get current date in America/Sao_Paulo timezone
  const now = new Date();
  const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
  const orderDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

  // Execute transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Get next daily number
    const seqResult = await client.query(
      'SELECT next_daily_number($1::date) AS daily_number',
      [orderDate]
    );
    const dailyNumber = seqResult.rows[0].daily_number;

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (daily_number, customer_name, origin, status, payment_status, total_amount_cents, order_date, created_at)
       VALUES ($1, $2, $3, 'aguardando', 'pendente', $4, $5, $6)
       RETURNING id, daily_number, customer_name, origin, status, payment_status, total_amount_cents, order_date, created_at`,
      [dailyNumber, customerName, origin, totalAmountCents, orderDate, now.toISOString()]
    );
    const order = orderResult.rows[0];

    // Insert order items
    const insertedItems: OrderItemRecord[] = [];
    for (const item of orderItems) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, order_id, menu_item_id, item_name, unit_price_cents, quantity`,
        [order.id, item.menuItemId, item.itemName, item.unitPriceCents, item.quantity]
      );
      insertedItems.push({
        id: itemResult.rows[0].id,
        menuItemId: itemResult.rows[0].menu_item_id,
        itemName: itemResult.rows[0].item_name,
        unitPriceCents: itemResult.rows[0].unit_price_cents,
        quantity: itemResult.rows[0].quantity,
      });
    }

    await client.query('COMMIT');

    // Build result
    const createdOrder: OrderRecord = {
      id: order.id,
      dailyNumber: order.daily_number,
      customerName: order.customer_name,
      origin: order.origin,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: null,
      totalAmountCents: order.total_amount_cents,
      orderDate: order.order_date,
      createdAt: order.created_at,
      startedAt: null,
      readyAt: null,
      deliveredAt: null,
      paidAt: null,
      items: insertedItems,
    };

    // Publish event to Realtime (fire and forget)
    broadcast('orders:queue', 'new_order', createdOrder);

    return createdOrder;
  } catch (txError: unknown) {
    await client.query('ROLLBACK');

    // Handle unique constraint violation on daily_number
    if (
      txError instanceof Error &&
      'code' in txError &&
      (txError as Record<string, unknown>).code === '23505' &&
      'constraint' in txError &&
      ((txError as Record<string, unknown>).constraint as string)?.includes('daily_number')
    ) {
      throw new ServiceError(
        'Conflito de numeração, tente novamente',
        409,
        'CONFLICT',
      );
    }

    throw txError;
  } finally {
    client.release();
  }
}

/**
 * Updates order status with transition validation and timestamp tracking.
 */
export async function updateOrderStatus(orderId: string, newStatus: OrderStatus): Promise<OrderRecord> {
  const client = await pool.connect();
  try {
    const orderResult = await client.query(
      'SELECT id, status, daily_number, customer_name, origin, payment_status, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new ServiceError(
        'Pedido não encontrado',
        404,
        'NOT_FOUND',
      );
    }

    const order = orderResult.rows[0];
    const currentStatus = order.status as OrderStatus;

    // Validate transition
    if (!isValidTransition(currentStatus, newStatus)) {
      throw new ServiceError(
        'Transição de status inválida',
        422,
        'VALIDATION_ERROR',
      );
    }

    // Determine timestamp field to set
    const transitionKey = `${currentStatus}→${newStatus}`;
    const timestampField = TRANSITION_TIMESTAMP_FIELD[transitionKey];
    const now = new Date().toISOString();

    // Update order in database
    const updateResult = await client.query(
      `UPDATE orders SET status = $1, ${timestampField} = $2 WHERE id = $3
       RETURNING id, daily_number, customer_name, origin, status, payment_status, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at`,
      [newStatus, now, orderId]
    );

    const updatedOrder = updateResult.rows[0];

    const responsePayload: OrderRecord = {
      id: updatedOrder.id,
      dailyNumber: updatedOrder.daily_number,
      customerName: updatedOrder.customer_name,
      origin: updatedOrder.origin,
      status: updatedOrder.status,
      paymentStatus: updatedOrder.payment_status,
      paymentMethod: null,
      totalAmountCents: updatedOrder.total_amount_cents,
      orderDate: updatedOrder.order_date,
      createdAt: updatedOrder.created_at,
      startedAt: updatedOrder.started_at,
      readyAt: updatedOrder.ready_at,
      deliveredAt: updatedOrder.delivered_at,
      paidAt: null,
    };

    // Publish event to Realtime (fire and forget)
    broadcast('orders:queue', 'status_updated', responsePayload);

    return responsePayload;
  } finally {
    client.release();
  }
}

/**
 * Registers payment for an order.
 * Validates order exists and is not already paid.
 */
export async function registerPayment(orderId: string, paymentMethod: string): Promise<OrderRecord> {
  const client = await pool.connect();
  try {
    const orderResult = await client.query(
      'SELECT id, daily_number, customer_name, origin, status, payment_status, payment_method, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at, paid_at FROM orders WHERE id = $1',
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      throw new ServiceError(
        'Pedido não encontrado',
        404,
        'NOT_FOUND',
      );
    }

    const order = orderResult.rows[0];

    // Check if already paid
    if (order.payment_status === 'pago') {
      throw new ServiceError(
        'Pedido já foi pago',
        409,
        'CONFLICT',
      );
    }

    // Update payment info
    const now = new Date().toISOString();
    const updateResult = await client.query(
      `UPDATE orders SET payment_status = 'pago', payment_method = $1, paid_at = $2 WHERE id = $3
       RETURNING id, daily_number, customer_name, origin, status, payment_status, payment_method, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at, paid_at`,
      [paymentMethod, now, orderId]
    );

    const updatedOrder = updateResult.rows[0];

    const responsePayload: OrderRecord = {
      id: updatedOrder.id,
      dailyNumber: updatedOrder.daily_number,
      customerName: updatedOrder.customer_name,
      origin: updatedOrder.origin,
      status: updatedOrder.status,
      paymentStatus: updatedOrder.payment_status,
      paymentMethod: updatedOrder.payment_method,
      totalAmountCents: updatedOrder.total_amount_cents,
      orderDate: updatedOrder.order_date,
      createdAt: updatedOrder.created_at,
      startedAt: updatedOrder.started_at,
      readyAt: updatedOrder.ready_at,
      deliveredAt: updatedOrder.delivered_at,
      paidAt: updatedOrder.paid_at,
    };

    // Publish event to Realtime (fire and forget)
    broadcast('orders:payment', 'payment_registered', responsePayload);

    return responsePayload;
  } finally {
    client.release();
  }
}

/**
 * Updates order items (full replacement) for orders in 'aguardando' status.
 * Validates all menu items exist and are active, no duplicates.
 */
export async function updateOrderItems(orderId: string, items: OrderItemInput[], customerName?: string, origin?: string): Promise<OrderRecord> {
  // Check for duplicate menuItemIds
  const menuItemIds = items.map((i) => i.menuItemId);
  const uniqueIds = new Set(menuItemIds);
  if (uniqueIds.size !== menuItemIds.length) {
    throw new ServiceError(
      'Itens duplicados não são permitidos',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Look up order by ID
  const orderResult = await pool.query(
    `SELECT id, daily_number, customer_name, origin, status, payment_status,
            payment_method, total_amount_cents, order_date, created_at,
            started_at, ready_at, delivered_at, paid_at
     FROM orders WHERE id = $1`,
    [orderId]
  );

  if (orderResult.rows.length === 0) {
    throw new ServiceError(
      'Pedido não encontrado',
      404,
      'NOT_FOUND',
    );
  }

  const order = orderResult.rows[0];

  // Check order status is 'aguardando'
  if (order.status !== 'aguardando') {
    throw new ServiceError(
      'Pedido só pode ser editado no status aguardando',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Validate all menu items exist and are active
  const menuResult = await pool.query(
    `SELECT id, name, price_cents, status FROM menu_items WHERE id = ANY($1::uuid[])`,
    [menuItemIds]
  );
  const menuItems = menuResult.rows;

  for (const item of items) {
    const menuItem = menuItems.find((mi: Record<string, unknown>) => mi.id === item.menuItemId);
    if (!menuItem || menuItem.status !== 'ativo') {
      throw new ServiceError(
        'Item não encontrado ou inativo',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // Execute transaction: DELETE old → INSERT new → UPDATE total
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Delete old order items
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

    // Insert new order items with price snapshots
    const insertedItems: OrderItemRecord[] = [];
    for (const item of items) {
      const menuItem = menuItems.find((mi: Record<string, unknown>) => mi.id === item.menuItemId)!;
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, order_id, menu_item_id, item_name, unit_price_cents, quantity`,
        [orderId, item.menuItemId, menuItem.name, menuItem.price_cents, item.quantity]
      );
      insertedItems.push({
        id: itemResult.rows[0].id,
        menuItemId: itemResult.rows[0].menu_item_id,
        itemName: itemResult.rows[0].item_name,
        unitPriceCents: itemResult.rows[0].unit_price_cents,
        quantity: itemResult.rows[0].quantity,
      });
    }

    // Calculate new total
    const totalAmountCents = insertedItems.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0
    );

    // Update order total (and optionally customerName/origin)
    const updateClauses = ['total_amount_cents = $1'];
    const updateValues: unknown[] = [totalAmountCents];
    let paramIdx = 2;

    if (customerName !== undefined) {
      updateClauses.push(`customer_name = $${paramIdx}`);
      updateValues.push(customerName);
      paramIdx++;
    }
    if (origin !== undefined) {
      updateClauses.push(`origin = $${paramIdx}`);
      updateValues.push(origin);
      paramIdx++;
    }

    updateValues.push(orderId);
    await client.query(
      `UPDATE orders SET ${updateClauses.join(', ')} WHERE id = $${paramIdx}`,
      updateValues
    );

    await client.query('COMMIT');

    // Build response
    const updatedOrder: OrderRecord = {
      id: order.id,
      dailyNumber: order.daily_number,
      customerName: customerName ?? order.customer_name,
      origin: origin ?? order.origin,
      status: order.status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      totalAmountCents,
      orderDate: order.order_date,
      createdAt: order.created_at,
      startedAt: order.started_at,
      readyAt: order.ready_at,
      deliveredAt: order.delivered_at,
      paidAt: order.paid_at,
      items: insertedItems,
    };

    // Broadcast order_updated event (fire and forget)
    broadcast('orders:queue', 'order_updated', updatedOrder);

    return updatedOrder;
  } catch (txError) {
    await client.query('ROLLBACK');
    throw txError;
  } finally {
    client.release();
  }
}
