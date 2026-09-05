import { Response } from 'express';
import { createOrderRequestSchema, updateOrderStatusRequestSchema, registerPaymentRequestSchema, updateOrderItemsRequestSchema } from '@order-system/shared';
import type { OrderStatus } from '@order-system/shared';
import type { ZodError } from 'zod';
import type { AuthenticatedRequest } from '../middleware/tenant.middleware.js';
import * as orderService from '../services/order.service.js';
import { parseBody } from '../http/parse-body.js';

// Erros de validação/negócio são lançados como ServiceError e mapeados
// centralmente pelo errorHandler (src/http/error-handler.js). A validação de
// corpo usa parseBody. As rotas envolvem estes handlers em asyncHandler.

/** Mensagem de validação do create-order: erro em `origin` tem texto próprio. */
function mapCreateOrderError(error: ZodError): string {
  const first = error.issues[0];
  if (first?.path.includes('origin')) {
    return 'Origem inválida';
  }
  return first?.message ?? 'Dados inválidos';
}

/** Mensagem de validação do update-order-items: vários casos específicos. */
function mapUpdateOrderItemsError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return 'Dados inválidos';
  if (first.message === 'Itens duplicados não são permitidos') {
    return 'Itens duplicados não são permitidos';
  }
  if (first.path.includes('items') && (first.code === 'too_small' || first.code === 'too_big')) {
    return 'A lista deve conter entre 1 e 50 itens';
  }
  if (first.path.includes('quantity')) {
    return 'Quantidade deve ser entre 1 e 99';
  }
  return first.message;
}

/**
 * GET /api/orders
 * List orders for a given date, optionally filtered by status.
 * Query params: ?status=aguardando&status=preparando&date=2026-08-19
 */
export async function getOrders(req: AuthenticatedRequest, res: Response): Promise<void> {
  const statusFilter = req.query.status;
  let statuses: string[] = [];

  if (Array.isArray(statusFilter)) {
    statuses = statusFilter as string[];
  } else if (typeof statusFilter === 'string') {
    statuses = statusFilter.split(',').map(s => s.trim()).filter(Boolean);
  }

  const date = typeof req.query.date === 'string' ? req.query.date : undefined;

  const orders = await orderService.getOrders(req.tenantId as string, statuses, date);
  res.status(200).json(orders);
}

/**
 * GET /api/orders/:id
 * Get a single order by ID.
 */
export async function getOrderById(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orderId = req.params.id as string;
  const order = await orderService.getOrderById(req.tenantId as string, orderId);
  res.status(200).json(order);
}

/**
 * POST /api/orders
 * Create a new order with Zod validation, price snapshots, and sequential numbering.
 */
export async function createOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = parseBody(createOrderRequestSchema, req.body, mapCreateOrderError);

  const order = await orderService.createOrder(req.tenantId as string, { ...data, createdBy: req.user!.id });
  res.status(201).json(order);
}

/**
 * PATCH /api/orders/:id/status
 * Update order status with transition validation and timestamp tracking.
 */
export async function updateOrderStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = parseBody(updateOrderStatusRequestSchema, req.body);

  const newStatus = data.status as OrderStatus;
  const orderId = req.params.id as string;

  const order = await orderService.updateOrderStatus(req.tenantId as string, orderId, newStatus);
  res.status(200).json(order);
}

/**
 * POST /api/orders/:id/payment
 * Register payment for an order with validation and duplicate rejection.
 */
export async function registerPayment(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = parseBody(registerPaymentRequestSchema, req.body, () => 'Forma de pagamento inválida');

  const orderId = req.params.id as string;
  const order = await orderService.registerPayment(req.tenantId as string, orderId, data.paymentMethod);
  res.status(200).json(order);
}

/**
 * PUT /api/orders/:id/items
 * Update order items (full replacement). Rejects if order is already paid.
 */
export async function updateOrderItems(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = parseBody(updateOrderItemsRequestSchema, req.body, mapUpdateOrderItemsError);

  const orderId = req.params.id as string;
  const order = await orderService.updateOrderItems(req.tenantId as string, orderId, data.items, data.customerName, data.origin);
  res.status(200).json(order);
}

/**
 * DELETE /api/orders/:id
 * Delete an order and its associated items/payment data.
 */
export async function deleteOrder(req: AuthenticatedRequest, res: Response): Promise<void> {
  const orderId = req.params.id as string;
  await orderService.deleteOrder(req.tenantId as string, orderId);
  res.status(204).send();
}
