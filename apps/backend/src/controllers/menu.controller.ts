import { Response } from 'express';
import {
  createMenuItemRequestSchema,
  updateMenuItemRequestSchema,
} from '@order-system/shared';
import type { AuthenticatedRequest } from '../middleware/tenant.middleware.js';
import * as menuService from '../services/menu.service.js';

// --- Error helpers ---

function handleServiceError(err: unknown, res: Response, fallbackMessage: string): void {
  if (err instanceof menuService.ServiceError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error: err.code,
      message: err.message,
    });
    return;
  }
  console.error('[menu]', err);
  res.status(500).json({
    statusCode: 500,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage,
  });
}

/**
 * GET /api/menu
 * Returns active menu items grouped by category, sorted by category sort_order
 * then alphabetically by item name within each category.
 */
export async function getMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const showAll = req.query.all === 'true';
    const menu = await menuService.getMenu(req.tenantId as string, showAll);
    res.status(200).json(menu);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao buscar cardápio.');
  }
}

/**
 * POST /api/menu
 * Create a new menu item with Zod validation.
 */
export async function createMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Validate with Zod
    const parsed = createMenuItemRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      if (firstError?.path?.includes('price') && firstError.code === 'too_small') {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Preço deve ser maior que zero',
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

    const item = await menuService.createMenuItem(req.tenantId as string, parsed.data);
    res.status(201).json(item);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao criar item.');
  }
}

/**
 * PUT /api/menu/:id
 * Update a menu item. Validates name collision with other active items (409).
 */
export async function updateMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Validate with Zod
    const parsed = updateMenuItemRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      if (firstError?.path?.includes('price') && firstError.code === 'too_small') {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Preço deve ser maior que zero',
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

    const item = await menuService.updateMenuItem(req.tenantId as string, id as string, parsed.data);
    res.status(200).json(item);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao atualizar item.');
  }
}

/**
 * DELETE /api/menu/:id
 * Delete a menu item if it has no associated order items.
 */
export async function deleteMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    await menuService.deleteMenuItem(req.tenantId as string, id as string);

    res.status(200).json({
      message: 'Item excluído com sucesso',
    });
  } catch (err) {
    handleServiceError(err, res, 'Erro ao excluir item.');
  }
}

/**
 * PATCH /api/menu/:id/status
 * Toggle item status between 'ativo' and 'inativo'.
 */
export async function toggleMenuItemStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const requestedStatus = req.body.status;

    const item = await menuService.toggleMenuItemStatus(req.tenantId as string, id as string, requestedStatus);
    res.status(200).json(item);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao atualizar status.');
  }
}
