import { Response } from 'express';
import {
  createCategoryRequestSchema,
  updateCategoryRequestSchema,
  reorderCategoriesRequestSchema,
} from '@order-system/shared';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

/**
 * GET /api/categories
 * Returns all categories with item count, sorted by sort_order ASC then name ASC.
 */
export async function listCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.sort_order, c.status, c.created_at,
              COUNT(mi.id)::int AS item_count
       FROM categories c
       LEFT JOIN menu_items mi ON mi.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`
    );

    const categories = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      status: row.status,
      itemCount: row.item_count,
      createdAt: row.created_at,
    }));

    res.status(200).json(categories);
  } catch (err) {
    console.error('[categories] listCategories error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
  }
}

/**
 * POST /api/categories
 * Create a new category with Zod validation.
 */
export async function createCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Check if name field is present
    if (req.body.name === undefined || req.body.name === null) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Nome é obrigatório',
      });
      return;
    }

    // 2. Validate with Zod
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

    const { name } = parsed.data;

    // 3. Check name uniqueness (case-insensitive)
    const existingResult = await pool.query(
      `SELECT id FROM categories WHERE LOWER(name) = LOWER($1)`,
      [name]
    );

    if (existingResult.rows.length > 0) {
      res.status(409).json({
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Já existe uma categoria com este nome',
      });
      return;
    }

    // 4. Compute sort_order (max + 1 or 0)
    const maxResult = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM categories`
    );
    const sortOrder = maxResult.rows[0].max_sort_order + 1;

    // 5. Insert category
    const insertResult = await pool.query(
      `INSERT INTO categories (name, sort_order, status)
       VALUES ($1, $2, 'ativo')
       RETURNING id, name, sort_order, status, created_at`,
      [name, sortOrder]
    );

    const row = insertResult.rows[0];

    res.status(201).json({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      status: row.status,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('[categories] createCategory error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
  }
}

/**
 * PUT /api/categories/:id
 * Update a category name.
 */
export async function updateCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // 1. Check if name field is present
    if (req.body.name === undefined || req.body.name === null) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Nome é obrigatório',
      });
      return;
    }

    // 2. Validate with Zod
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

    const { name } = parsed.data;

    // 3. Check category exists
    const existResult = await pool.query(
      `SELECT id, name, sort_order, created_at FROM categories WHERE id = $1`,
      [id]
    );

    if (existResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // 4. Check name uniqueness excluding self (case-insensitive)
    const duplicateResult = await pool.query(
      `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2`,
      [name, id]
    );

    if (duplicateResult.rows.length > 0) {
      res.status(409).json({
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Já existe uma categoria com este nome',
      });
      return;
    }

    // 5. Update name
    const updateResult = await pool.query(
      `UPDATE categories SET name = $1 WHERE id = $2
       RETURNING id, name, sort_order, created_at`,
      [name, id]
    );

    const row = updateResult.rows[0];

    res.status(200).json({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('[categories] updateCategory error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
  }
}

/**
 * PUT /api/categories/reorder
 * Reorder all categories atomically using a transaction.
 */
export async function reorderCategories(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate with Zod
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

    const { categoryIds } = parsed.data;

    // 2. Check for duplicates
    const uniqueIds = new Set(categoryIds);
    if (uniqueIds.size !== categoryIds.length) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Lista contém categorias duplicadas',
      });
      return;
    }

    // 3. Get all existing categories
    const existingResult = await pool.query(`SELECT id FROM categories`);
    const existingIds = new Set(existingResult.rows.map((row) => row.id));

    // 4. Check all IDs exist
    for (const categoryId of categoryIds) {
      if (!existingIds.has(categoryId)) {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Categoria não encontrada na lista',
        });
        return;
      }
    }

    // 5. Check count matches total
    if (categoryIds.length !== existingIds.size) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'A lista deve conter todas as categorias',
      });
      return;
    }

    // 6. Update sort_order in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < categoryIds.length; i++) {
        await client.query(
          `UPDATE categories SET sort_order = $1 WHERE id = $2`,
          [i, categoryIds[i]]
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    // 7. Return updated list
    const updatedResult = await pool.query(
      `SELECT c.id, c.name, c.sort_order, c.status, c.created_at,
              COUNT(mi.id)::int AS item_count
       FROM categories c
       LEFT JOIN menu_items mi ON mi.category_id = c.id
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.name ASC`
    );

    const categories = updatedResult.rows.map((row) => ({
      id: row.id,
      name: row.name,
      sortOrder: row.sort_order,
      status: row.status,
      itemCount: row.item_count,
      createdAt: row.created_at,
    }));

    res.status(200).json(categories);
  } catch (err) {
    console.error('[categories] reorderCategories error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
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

    // 1. Check category exists
    const categoryResult = await pool.query(
      `SELECT id, name, sort_order, status, created_at FROM categories WHERE id = $1`,
      [id]
    );

    if (categoryResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Categoria não encontrada',
      });
      return;
    }

    const category = categoryResult.rows[0];

    if (action === 'deactivate') {
      // 2a. Validate current status for deactivation
      if (category.status === 'inativo') {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Categoria já está inativa',
        });
        return;
      }

      // 3a. Guard: check for active menu items
      const activeItemsResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1 AND status = 'ativo'`,
        [id]
      );

      if (activeItemsResult.rows[0].count > 0) {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Categoria possui itens ativos. Desative os itens antes de desativar a categoria',
        });
        return;
      }

      // 4a. Update to inativo
      const updateResult = await pool.query(
        `UPDATE categories SET status = 'inativo' WHERE id = $1
         RETURNING id, name, sort_order, status, created_at`,
        [id]
      );

      const row = updateResult.rows[0];
      res.status(200).json({
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
        status: row.status,
        createdAt: row.created_at,
      });
    } else if (action === 'activate') {
      // 2b. Validate current status for activation
      if (category.status === 'ativo') {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Categoria já está ativa',
        });
        return;
      }

      // 3b. Update to ativo
      const updateResult = await pool.query(
        `UPDATE categories SET status = 'ativo' WHERE id = $1
         RETURNING id, name, sort_order, status, created_at`,
        [id]
      );

      const row = updateResult.rows[0];
      res.status(200).json({
        id: row.id,
        name: row.name,
        sortOrder: row.sort_order,
        status: row.status,
        createdAt: row.created_at,
      });
    } else {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Ação inválida. Use "activate" ou "deactivate"',
      });
    }
  } catch (err) {
    console.error('[categories] toggleCategoryStatus error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
  }
}

/**
 * DELETE /api/categories/:id
 * Delete a category if it has no associated menu items.
 */
export async function deleteCategory(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // 1. Check category exists
    const categoryResult = await pool.query(
      `SELECT id FROM categories WHERE id = $1`,
      [id]
    );

    if (categoryResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Categoria não encontrada',
      });
      return;
    }

    // 2. Guard: check for associated menu items (any status)
    const itemsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1`,
      [id]
    );

    if (itemsResult.rows[0].count > 0) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Categoria possui itens associados. Mova ou exclua os itens antes de excluir a categoria',
      });
      return;
    }

    // 3. Delete category
    await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);

    res.status(200).json({
      message: 'Categoria excluída com sucesso',
    });
  } catch (err) {
    console.error('[categories] deleteCategory error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao processar requisição',
    });
  }
}
