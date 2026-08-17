import { Response } from 'express';
import { createOrderRequestSchema, updateOrderStatusRequestSchema, registerPaymentRequestSchema, updateOrderItemsRequestSchema } from '@order-system/shared';
import type { OrderStatus } from '@order-system/shared';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import * as orderService from '../services/order.service.js';

// --- Error helpers ---

function handleServiceError(err: unknown, res: Response, fallbackMessage: string): void {
  if (err instanceof orderService.ServiceError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error: err.code,
      message: err.message,
    });
    return;
  }
  console.error('[order]', err);
  res.status(500).json({
    statusCode: 500,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage,
  });
}

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
      statuses = statusFilter as string[];
    } else if (typeof statusFilter === 'string') {
      statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean);
    }

    const orders = await orderService.getOrders(statuses);
    res.status(200).json(orders);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao buscar pedidos.');
  }
}

/**
 * POST /api/orders
 * Create a new order with Zod validation, price snapshots, and sequential numbering.
 */
export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Validate request body with Zod
    const parsed = createOrderRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
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

    const order = await orderService.createOrder(parsed.data);
    res.status(201).json(order);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao criar pedido.');
  }
}

/**
 * PATCH /api/orders/:id/status
 * Update order status with transition validation and timestamp tracking.
 */
export async function updateOrderStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Validate request body with Zod
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
    const orderId = req.params.id as string;

    const order = await orderService.updateOrderStatus(orderId, newStatus);
    res.status(200).json(order);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao atualizar status do pedido.');
  }
}

/**
 * POST /api/orders/:id/payment
 * Register payment for an order with validation and duplicate rejection.
 */
export async function registerPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Validate request body with Zod
    const parsed = registerPaymentRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Forma de pagamento inválida',
      });
      return;
    }

    const orderId = req.params.id as string;
    const order = await orderService.registerPayment(orderId, parsed.data.paymentMethod);
    res.status(200).json(order);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao registrar pagamento.');
  }
}

/**
 * PUT /api/orders/:id/items
 * Update order items (full replacement) for orders in 'aguardando' status.
 */
export async function updateOrderItems(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Validate request body with Zod
    const parsed = updateOrderItemsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      let message = 'Dados inválidos';

      if (firstError) {
        if (firstError.message === 'Itens duplicados não são permitidos') {
          message = 'Itens duplicados não são permitidos';
        } else if (firstError.path?.includes('items') && firstError.code === 'too_small') {
          message = 'A lista deve conter entre 1 e 50 itens';
        } else if (firstError.path?.includes('items') && firstError.code === 'too_big') {
          message = 'A lista deve conter entre 1 e 50 itens';
        } else if (firstError.path?.includes('quantity')) {
          message = 'Quantidade deve ser entre 1 e 99';
        } else {
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

    const orderId = req.params.id as string;
    const order = await orderService.updateOrderItems(orderId, parsed.data.items);
    res.status(200).json(order);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao atualizar itens do pedido.');
  }
}
