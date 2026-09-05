import { Response } from 'express';
import {
  createMenuItemRequestSchema,
  updateMenuItemRequestSchema,
} from '@order-system/shared';
import type { ZodError } from 'zod';
import type { AuthenticatedRequest } from '../middleware/tenant.middleware.js';
import * as menuService from '../services/menu.service.js';
import { parseBody } from '../http/parse-body.js';

// Erros de validação/negócio são lançados como ServiceError e mapeados
// centralmente pelo errorHandler (src/http/error-handler.js). A validação de
// corpo usa parseBody. As rotas envolvem estes handlers em asyncHandler.

/**
 * Mensagem de validação do menu: preço <= 0 recebe uma mensagem específica;
 * demais erros usam a primeira issue do Zod.
 */
function mapMenuValidationError(error: ZodError): string {
  const first = error.issues[0];
  if (first?.path.includes('price') && first.code === 'too_small') {
    return 'Preço deve ser maior que zero';
  }
  return first?.message ?? 'Dados inválidos';
}

/**
 * GET /api/menu
 * Returns active menu items grouped by category, sorted by category sort_order
 * then alphabetically by item name within each category.
 */
export async function getMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  const showAll = req.query.all === 'true';
  const menu = await menuService.getMenu(req.tenantId as string, showAll);
  res.status(200).json(menu);
}

/**
 * POST /api/menu
 * Create a new menu item with Zod validation.
 */
export async function createMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = parseBody(createMenuItemRequestSchema, req.body, mapMenuValidationError);

  const item = await menuService.createMenuItem(req.tenantId as string, data);
  res.status(201).json(item);
}

/**
 * PUT /api/menu/:id
 * Update a menu item. Validates name collision with other active items (409).
 */
export async function updateMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const data = parseBody(updateMenuItemRequestSchema, req.body, mapMenuValidationError);

  const item = await menuService.updateMenuItem(req.tenantId as string, id as string, data);
  res.status(200).json(item);
}

/**
 * DELETE /api/menu/:id
 * Delete a menu item if it has no associated order items.
 */
export async function deleteMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  await menuService.deleteMenuItem(req.tenantId as string, id as string);

  res.status(200).json({
    message: 'Item excluído com sucesso',
  });
}

/**
 * PATCH /api/menu/:id/status
 * Toggle item status between 'ativo' and 'inativo'.
 */
export async function toggleMenuItemStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const requestedStatus = req.body.status;

  const item = await menuService.toggleMenuItemStatus(req.tenantId as string, id as string, requestedStatus);
  res.status(200).json(item);
}
