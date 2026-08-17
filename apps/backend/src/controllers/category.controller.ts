import { Response } from 'express';
import {
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  reorderCategoriesRequestSchema,
} from '@order-system/shared';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import * as categoryService from '../services/category.service.js';

// --- Error helpers ---

function handleServiceError(err: unknown, res: Response, fallbackMessage: string): void {
  if (err instanceof categoryService.ServiceError) {
    res.status(err.statusCode).json({
      statusCode: err.statusCode,
      error: err.code,
      message: err.message,
    });
    return;
  }
  console.error('[categories]', err);
  res.status(500).json({
    statusCode: 500,
    error: 'INTERNAL_ERROR',
    message: fallbackMessage,
  });
}

/**
 * GET /api/categories
 * Returns all categories with item count, sorted by sort_order ASC then name ASC.
 */
export async function listCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const categories = await categoryService.listCategories();
    res.status(200).json(categories);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao processar requisição');
  }
}

/**
 * POST /api/categories
 * Create a new category with Zod validation.
 */
export async function createCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Check if name field is present
    if (req.body.name === undefined || req.body.name === null) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Nome é obrigatório',
      });
      return;
    }

    // Validate with Zod
    const parsed = createCategoryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: firstError?.message || 'Dados inválidos',
      });
      return;
    }

    const category = await categoryService.createCategory(parsed.data.name);
    res.status(201).json(category);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao processar requisição');
  }
}

/**
 * PUT /api/categories/:id
 * Update a category name.
 */
export async function updateCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Check if name field is present
    if (req.body.name === undefined || req.body.name === null) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Nome é obrigatório',
      });
      return;
    }

    // Validate with Zod
    const parsed = updateCategoryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: firstError?.message || 'Dados inválidos',
      });
      return;
    }

    const category = await categoryService.updateCategory(id as string, parsed.data.name);
    res.status(200).json(category);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao processar requisição');
  }
}

/**
 * PUT /api/categories/reorder
 * Reorder all categories atomically using a transaction.
 */
export async function reorderCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // Validate with Zod
    const parsed = reorderCategoriesRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: firstError?.message || 'Dados inválidos',
      });
      return;
    }

    const categories = await categoryService.reorderCategories(parsed.data.categoryIds);
    res.status(200).json(categories);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao processar requisição');
  }
}

/**
 * PATCH /api/categories/:id/status
 * Toggle category status between 'ativo' and 'inativo'.
 * Body: { action: 'activate' | 'deactivate' }
 */
export async function toggleCategoryStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const category = await categoryService.toggleCategoryStatus(id as string, action);
    res.status(200).json(category);
  } catch (err) {
    handleServiceError(err, res, 'Erro ao processar requisição');
  }
}

/**
 * DELETE /api/categories/:id
 * Delete a category if it has no associated menu items.
 */
export async function deleteCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    await categoryService.deleteCategory(id as string);

    res.status(200).json({
      message: 'Categoria excluída com sucesso',
    });
  } catch (err) {
    handleServiceError(err, res, 'Erro ao processar requisição');
  }
}
