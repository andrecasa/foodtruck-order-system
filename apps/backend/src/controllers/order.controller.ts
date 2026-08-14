import { Response } from 'express';
import { createOrderRequestSchema, updateOrderStatusRequestSchema, registerPaymentRequestSchema, updateOrderItemsRequestSchema, isValidTransition } from '@order-system/shared';
import type { OrderStatus } from '@order-system/shared';
import { pool } from '../config/database.js';
import { broadcast } from '../config/realtime.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { toZonedTime, format } from 'date-fns-tz';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

/**
 * GET /api/orders
 * List orders for today, optionally filtered by status.
 * Query params: ?status=aguardando&status=preparando
 */
export async function getOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const statusFilter = req.query.status;
    let statuses: string[] = [];

    if (Array.isArray(statusFilter)) {
      // ?status=aguardando&status=preparando
      statuses = statusFilter as string[];
    } else if (typeof statusFilter === 'string') {
      // ?status=aguardando,preparando,pronto
      statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean);
    }

    let query: string;
    let params: any[];

    // Get today's date in São Paulo timezone
    const now = new Date();
    const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
    const today = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

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
    const orderIds = ordersResult.rows.map((o: any) => o.id);
    let itemsMap: Record<string, any[]> = {};

    if (orderIds.length > 0) {
      const itemsResult = await pool.query(
        `SELECT id, order_id, menu_item_id, item_name, unit_price_cents, quantity
         FROM order_items WHERE order_id = ANY($1::uuid[])`,
        [orderIds]
      );
      for (const item of itemsResult.rows) {
        if (!itemsMap[item.order_id]) itemsMap[item.order_id] = [];
        itemsMap[item.order_id].push({
          id: item.id,
          menuItemId: item.menu_item_id,
          itemName: item.item_name,
          unitPriceCents: item.unit_price_cents,
          quantity: item.quantity,
        });
      }
    }

    const orders = ordersResult.rows.map((o: any) => ({
      id: o.id,
      dailyNumber: o.daily_number,
      customerName: o.customer_name,
      origin: o.origin,
      status: o.status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
      totalAmountCents: o.total_amount_cents,
      orderDate: o.order_date,
      createdAt: o.created_at,
      startedAt: o.started_at,
      readyAt: o.ready_at,
      deliveredAt: o.delivered_at,
      paidAt: o.paid_at,
      items: itemsMap[o.id] || [],
    }));

    res.status(200).json(orders);
  } catch (err) {
    console.error('[order] getOrders error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao buscar pedidos.',
    });
  }
}

/**
 * POST /api/orders
 * Create a new order with Zod validation, price snapshots, and sequential numbering.
 */
export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate request body with Zod
    const parsed = createOrderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      // Check if origin validation failed
      if (firstError?.path?.includes('origin')) {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Origem inválida',
        });
        return;
      }
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: firstError?.message || 'Dados inválidos',
      });
      return;
    }

    const { customerName, origin, items } = parsed.data;

    // 2. Validate all menu items exist and are active
    const menuItemIds = items.map((i) => i.menuItemId);
    const menuResult = await pool.query(
      `SELECT id, name, price_cents, status FROM menu_items WHERE id = ANY($1::uuid[])`,
      [menuItemIds]
    );
    const menuItems = menuResult.rows;

    if (!menuItems || menuItems.length === 0) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Item não encontrado ou inativo',
      });
      return;
    }

    // Check all items exist and are active
    for (const item of items) {
      const menuItem = menuItems.find((mi: any) => mi.id === item.menuItemId);
      if (!menuItem || menuItem.status !== 'ativo') {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Item não encontrado ou inativo',
        });
        return;
      }
    }

    // 3. Calculate total and prepare order items with snapshots
    const orderItems = items.map((item) => {
      const menuItem = menuItems.find((mi: any) => mi.id === item.menuItemId)!;
      return {
        menuItemId: item.menuItemId,
        itemName: menuItem.name,
        unitPriceCents: menuItem.price_cents,
        quantity: item.quantity,
      };
    });

    const totalAmountCents = orderItems.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0
    );

    // 4. Get current date in America/Sao_Paulo timezone
    const now = new Date();
    const zonedDate = toZonedTime(now, SAO_PAULO_TZ);
    const orderDate = format(zonedDate, 'yyyy-MM-dd', { timeZone: SAO_PAULO_TZ });

    // 5. Execute transaction with pg
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
      const insertedItems = [];
      for (const item of orderItems) {
        const itemResult = await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, order_id, menu_item_id, item_name, unit_price_cents, quantity`,
          [order.id, item.menuItemId, item.itemName, item.unitPriceCents, item.quantity]
        );
        insertedItems.push(itemResult.rows[0]);
      }

      await client.query('COMMIT');

      // 6. Build response
      const createdOrder = {
        id: order.id,
        dailyNumber: order.daily_number,
        customerName: order.customer_name,
        origin: order.origin,
        status: order.status,
        paymentStatus: order.payment_status,
        totalAmountCents: order.total_amount_cents,
        orderDate: order.order_date,
        createdAt: order.created_at,
        items: insertedItems.map((i) => ({
          id: i.id,
          menuItemId: i.menu_item_id,
          itemName: i.item_name,
          unitPriceCents: i.unit_price_cents,
          quantity: i.quantity,
        })),
      };

      // 7. Publish event to Realtime (fire and forget)
      broadcast('orders:queue', 'new_order', createdOrder);

      res.status(201).json(createdOrder);
    } catch (txError: any) {
      await client.query('ROLLBACK');

      // Handle unique constraint violation on daily_number
      if (txError.code === '23505' && txError.constraint?.includes('daily_number')) {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Conflito de numeração, tente novamente',
        });
        return;
      }

      throw txError;
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao criar pedido.',
    });
  }
}


/**
 * Map of status transitions to their corresponding timestamp fields.
 */
const TRANSITION_TIMESTAMP_FIELD: Record<string, string> = {
  'aguardando→preparando': 'started_at',
  'preparando→pronto': 'ready_at',
  'pronto→entregue': 'delivered_at',
};

/**
 * PATCH /api/orders/:id/status
 * Update order status with transition validation and timestamp tracking.
 */
export async function updateOrderStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate request body with Zod
    const parsed = updateOrderStatusRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: parsed.error.errors[0]?.message || 'Dados inválidos',
      });
      return;
    }

    const newStatus = parsed.data.status as OrderStatus;
    const orderId = req.params.id;

    // 2. Get current order from database
    const client = await pool.connect();
    try {
      const orderResult = await client.query(
        'SELECT id, status, daily_number, customer_name, origin, payment_status, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        res.status(404).json({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'Pedido não encontrado',
        });
        return;
      }

      const order = orderResult.rows[0];
      const currentStatus = order.status as OrderStatus;

      // 3. Validate transition
      if (!isValidTransition(currentStatus, newStatus)) {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Transição de status inválida',
        });
        return;
      }

      // 4. Determine timestamp field to set
      const transitionKey = `${currentStatus}→${newStatus}`;
      const timestampField = TRANSITION_TIMESTAMP_FIELD[transitionKey];
      const now = new Date().toISOString();

      // 5. Update order in database
      const updateResult = await client.query(
        `UPDATE orders SET status = $1, ${timestampField} = $2 WHERE id = $3
         RETURNING id, daily_number, customer_name, origin, status, payment_status, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at`,
        [newStatus, now, orderId]
      );

      const updatedOrder = updateResult.rows[0];

      // 6. Build response
      const responsePayload = {
        id: updatedOrder.id,
        dailyNumber: updatedOrder.daily_number,
        customerName: updatedOrder.customer_name,
        origin: updatedOrder.origin,
        status: updatedOrder.status,
        paymentStatus: updatedOrder.payment_status,
        totalAmountCents: updatedOrder.total_amount_cents,
        orderDate: updatedOrder.order_date,
        createdAt: updatedOrder.created_at,
        startedAt: updatedOrder.started_at,
        readyAt: updatedOrder.ready_at,
        deliveredAt: updatedOrder.delivered_at,
      };

      // 7. Publish event to Realtime (fire and forget)
      broadcast('orders:queue', 'status_updated', responsePayload);

      res.status(200).json(responsePayload);
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao atualizar status do pedido.',
    });
  }
}


/**
 * POST /api/orders/:id/payment
 * Register payment for an order with validation and duplicate rejection.
 */
export async function registerPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate request body with Zod
    const parsed = registerPaymentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Forma de pagamento inválida',
      });
      return;
    }

    const { paymentMethod } = parsed.data;
    const orderId = req.params.id;

    // 2. Get current order from database
    const client = await pool.connect();
    try {
      const orderResult = await client.query(
        'SELECT id, daily_number, customer_name, origin, status, payment_status, payment_method, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at, paid_at FROM orders WHERE id = $1',
        [orderId]
      );

      if (orderResult.rows.length === 0) {
        res.status(404).json({
          statusCode: 404,
          error: 'NOT_FOUND',
          message: 'Pedido não encontrado',
        });
        return;
      }

      const order = orderResult.rows[0];

      // 3. Check if already paid
      if (order.payment_status === 'pago') {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Pedido já foi pago',
        });
        return;
      }

      // 4. Update payment info
      const now = new Date().toISOString();
      const updateResult = await client.query(
        `UPDATE orders SET payment_status = 'pago', payment_method = $1, paid_at = $2 WHERE id = $3
         RETURNING id, daily_number, customer_name, origin, status, payment_status, payment_method, total_amount_cents, order_date, created_at, started_at, ready_at, delivered_at, paid_at`,
        [paymentMethod, now, orderId]
      );

      const updatedOrder = updateResult.rows[0];

      // 5. Build response
      const responsePayload = {
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

      // 6. Publish event to Realtime (fire and forget)
      broadcast('orders:payment', 'payment_registered', responsePayload);

      res.status(200).json(responsePayload);
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao registrar pagamento.',
    });
  }
}


/**
 * PUT /api/orders/:id/items
 * Update order items (full replacement) for orders in 'aguardando' status.
 */
export async function updateOrderItems(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate request body with Zod
    const parsed = updateOrderItemsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      // Determine the appropriate error message
      let message = 'Dados inválidos';

      if (firstError) {
        // Check for duplicate items (refine message)
        if (firstError.message === 'Itens duplicados não são permitidos') {
          message = 'Itens duplicados não são permitidos';
        }
        // Check for items array length issues
        else if (firstError.path?.includes('items') && firstError.code === 'too_small') {
          message = 'A lista deve conter entre 1 e 50 itens';
        } else if (firstError.path?.includes('items') && firstError.code === 'too_big') {
          message = 'A lista deve conter entre 1 e 50 itens';
        }
        // Check for quantity out of range
        else if (firstError.path?.includes('quantity')) {
          message = 'Quantidade deve ser entre 1 e 99';
        }
        // For other validation errors, use the Zod message
        else {
          message = firstError.message;
        }
      }

      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message,
      });
      return;
    }

    const { items } = parsed.data;
    const orderId = req.params.id;

    // 2. Belt-and-suspenders: check for duplicate menuItemIds
    const menuItemIds = items.map((i) => i.menuItemId);
    const uniqueIds = new Set(menuItemIds);
    if (uniqueIds.size !== menuItemIds.length) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Itens duplicados não são permitidos',
      });
      return;
    }

    // 3. Look up order by ID
    const orderResult = await pool.query(
      `SELECT id, daily_number, customer_name, origin, status, payment_status,
              payment_method, total_amount_cents, order_date, created_at,
              started_at, ready_at, delivered_at, paid_at
       FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Pedido não encontrado',
      });
      return;
    }

    const order = orderResult.rows[0];

    // 4. Check order status is 'aguardando'
    if (order.status !== 'aguardando') {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Pedido só pode ser editado no status aguardando',
      });
      return;
    }

    // 5. Validate all menu items exist and are active
    const menuResult = await pool.query(
      `SELECT id, name, price_cents, status FROM menu_items WHERE id = ANY($1::uuid[])`,
      [menuItemIds]
    );
    const menuItems = menuResult.rows;

    for (const item of items) {
      const menuItem = menuItems.find((mi: any) => mi.id === item.menuItemId);
      if (!menuItem || menuItem.status !== 'ativo') {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Item não encontrado ou inativo',
        });
        return;
      }
    }

    // 6. Execute transaction: DELETE old → INSERT new → UPDATE total
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Delete old order items
      await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);

      // Insert new order items with price snapshots
      const insertedItems = [];
      for (const item of items) {
        const menuItem = menuItems.find((mi: any) => mi.id === item.menuItemId)!;
        const itemResult = await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, order_id, menu_item_id, item_name, unit_price_cents, quantity`,
          [orderId, item.menuItemId, menuItem.name, menuItem.price_cents, item.quantity]
        );
        insertedItems.push(itemResult.rows[0]);
      }

      // Calculate new total
      const totalAmountCents = insertedItems.reduce(
        (sum, item) => sum + item.unit_price_cents * item.quantity,
        0
      );

      // Update order total
      await client.query(
        'UPDATE orders SET total_amount_cents = $1 WHERE id = $2',
        [totalAmountCents, orderId]
      );

      await client.query('COMMIT');

      // 7. Build response (same shape as createOrder)
      const updatedOrder = {
        id: order.id,
        dailyNumber: order.daily_number,
        customerName: order.customer_name,
        origin: order.origin,
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
        items: insertedItems.map((i) => ({
          id: i.id,
          menuItemId: i.menu_item_id,
          itemName: i.item_name,
          unitPriceCents: i.unit_price_cents,
          quantity: i.quantity,
        })),
      };

      // 8. Broadcast order_updated event (fire and forget)
      broadcast('orders:queue', 'order_updated', updatedOrder);

      res.status(200).json(updatedOrder);
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao atualizar itens do pedido.',
    });
  }
}
