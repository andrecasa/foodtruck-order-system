import { type Response } from 'express';
import {
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  reorderCategoriesRequestSchema,
} from '@order-system/shared';
import type { AuthenticatedRequest } from '../middleware/tenant.middleware.js';
import * as categoryService from '../services/category.service.js';
import { parseBody } from '../http/parse-body.js';

// Erros de validação/negócio são lançados como ServiceError e mapeados
// centralmente pelo errorHandler (src/http/error-handler.js). A validação de
// corpo usa parseBody (lança 422 VALIDATION_ERROR). As rotas envolvem estes
// handlers em asyncHandler para encaminhar rejeições.

/**
 * GET /api/categories
 * Returns all categories with item count, sorted by sort_order ASC then name ASC.
 */
export async function listCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  const categories = await categoryService.listCategories(req.tenantId as string);
  res.status(200).json(categories);
}

/**
 * POST /api/categories
 * Create a new category with Zod validation.
 */
export async function createCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  // Check if name field is present
  if (req.body.name === undefined || req.body.name === null) {
    throw new categoryService.ServiceError('Nome é obrigatório', 422, 'VALIDATION_ERROR');
  }

  const data = parseBody(createCategoryRequestSchema, req.body);

  const category = await categoryService.createCategory(req.tenantId as string, data.name);
  res.status(201).json(category);
}

/**
 * PUT /api/categories/:id
 * Update a category name.
 */
export async function updateCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  // Check if name field is present
  if (req.body.name === undefined || req.body.name === null) {
    throw new categoryService.ServiceError('Nome é obrigatório', 422, 'VALIDATION_ERROR');
  }

  const data = parseBody(updateCategoryRequestSchema, req.body);

  const category = await categoryService.updateCategory(req.tenantId as string, id as string, data.name);
  res.status(200).json(category);
}

/**
 * PUT /api/categories/reorder
 * Reorder all categories atomically using a transaction.
 */
export async function reorderCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  const data = parseBody(reorderCategoriesRequestSchema, req.body);

  const categories = await categoryService.reorderCategories(req.tenantId as string, data.categoryIds);
  res.status(200).json(categories);
}

/**
 * PATCH /api/categories/:id/status
 * Toggle category status between 'ativo' and 'inativo'.
 * Body: { action: 'activate' | 'deactivate' }
 */
export async function toggleCategoryStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;
  const { action } = req.body;

  const category = await categoryService.toggleCategoryStatus(req.tenantId as string, id as string, action);
  res.status(200).json(category);
}

/**
 * DELETE /api/categories/:id
 * Delete a category if it has no associated menu items.
 */
export async function deleteCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { id } = req.params;

  await categoryService.deleteCategory(req.tenantId as string, id as string);

  res.status(200).json({
    message: 'Categoria excluída com sucesso',
  });
}
