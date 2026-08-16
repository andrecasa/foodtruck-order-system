import { Response } from 'express';
import {
  createMenuItemRequestSchema,
  updateMenuItemRequestSchema,
} from '@order-system/shared';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';

/**
 * GET /api/menu
 * Returns active menu items grouped by category, sorted by category sort_order
 * then alphabetically by item name within each category.
 */
export async function getMenu(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const showAll = req.query.all === 'true';

    const query = showAll
      ? `SELECT mi.id, mi.name, mi.price_cents, mi.status, mi.created_at, mi.updated_at,
                c.name AS category_name, c.sort_order AS category_sort_order
         FROM menu_items mi
         LEFT JOIN categories c ON mi.category_id = c.id
         ORDER BY c.sort_order ASC, mi.name ASC`
      : `SELECT mi.id, mi.name, mi.price_cents, mi.status, mi.created_at, mi.updated_at,
                c.name AS category_name, c.sort_order AS category_sort_order
         FROM menu_items mi
         LEFT JOIN categories c ON mi.category_id = c.id
         WHERE mi.status = 'ativo' AND c.status = 'ativo'
         ORDER BY c.sort_order ASC, mi.name ASC`;

    const result = await pool.query(query);

    // Group by category
    const grouped: Record<string, { category: string; sortOrder: number; items: Array<{ id: string; name: string; price: number; category: string; status: string; createdAt: string; updatedAt: string }> }> = {};

    for (const row of result.rows) {
      const categoryName = row.category_name || 'Sem categoria';
      const sortOrder = row.category_sort_order ?? 999;

      if (!grouped[categoryName]) {
        grouped[categoryName] = { category: categoryName, sortOrder, items: [] };
      }

      grouped[categoryName].items.push({
        id: row.id,
        name: row.name,
        price: row.price_cents,
        category: categoryName,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    const response = Object.values(grouped)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ category, items }) => ({
        category,
        items,
      }));

    res.status(200).json(response);
  } catch (err) {
    console.error('[menu] getMenu error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao buscar cardápio.',
    });
  }
}

/**
 * POST /api/menu
 * Create a new menu item with Zod validation.
 * Validates: category exists (422), name uniqueness case-insensitive among active items (409), price > 0 (422).
 */
export async function createMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    // 1. Validate with Zod
    const parsed = createMenuItemRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      // Check if the price validation failed (price <= 0)
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

    const { name, price, category } = parsed.data;

    // 2. Check price > 0 (already validated by Zod min(1), but explicit for clarity)
    if (price <= 0) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Preço deve ser maior que zero',
      });
      return;
    }

    // 3. Check category exists (case-insensitive, active only)
    const categoryResult = await pool.query(
      `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND status = 'ativo' LIMIT 1`,
      [category]
    );

    if (categoryResult.rows.length === 0) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Categoria inválida',
      });
      return;
    }

    const categoryData = categoryResult.rows[0];

    // 4. Check name uniqueness (case-insensitive) among active items
    const existingResult = await pool.query(
      `SELECT id FROM menu_items WHERE LOWER(name) = LOWER($1) AND status = 'ativo'`,
      [name]
    );

    if (existingResult.rows.length > 0) {
      res.status(409).json({
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Item com este nome já existe',
      });
      return;
    }

    // 5. Insert item
    const insertResult = await pool.query(
      `INSERT INTO menu_items (name, price_cents, category_id, status)
       VALUES ($1, $2, $3, 'ativo')
       RETURNING id, name, price_cents, status, created_at, updated_at, category_id`,
      [name, price, categoryData.id]
    );

    if (insertResult.rows.length === 0) {
      res.status(500).json({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao criar item.',
      });
      return;
    }

    const newItem = insertResult.rows[0];

    // Get category name
    const catNameResult = await pool.query(
      `SELECT name FROM categories WHERE id = $1`,
      [newItem.category_id]
    );
    const catName = catNameResult.rows[0]?.name || category;

    res.status(201).json({
      id: newItem.id,
      name: newItem.name,
      price: newItem.price_cents,
      category: catName,
      status: newItem.status,
      createdAt: newItem.created_at,
      updatedAt: newItem.updated_at,
    });
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao criar item.',
    });
  }
}

/**
 * PUT /api/menu/:id
 * Update a menu item. Validates name collision with other active items (409).
 * Does not allow changing the ID.
 */
export async function updateMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // 1. Validate with Zod
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

    const { name, price, category } = parsed.data;

    // 2. Check item exists
    const itemResult = await pool.query(
      `SELECT id, status FROM menu_items WHERE id = $1`,
      [id]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Item não encontrado.',
      });
      return;
    }

    // 3. If price provided, validate > 0
    if (price !== undefined && price <= 0) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Preço deve ser maior que zero',
      });
      return;
    }

    // 4. If category provided, validate it exists
    let categoryId: string | undefined;
    if (category !== undefined) {
      const catResult = await pool.query(
        `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND status = 'ativo' LIMIT 1`,
        [category]
      );

      if (catResult.rows.length === 0) {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Categoria inválida',
        });
        return;
      }
      categoryId = catResult.rows[0].id;
    }

    // 5. If name provided, check collision with other active items (excluding this one)
    if (name !== undefined) {
      const collisionResult = await pool.query(
        `SELECT id FROM menu_items WHERE LOWER(name) = LOWER($1) AND status = 'ativo' AND id != $2`,
        [name, id]
      );

      if (collisionResult.rows.length > 0) {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Item com este nome já existe',
        });
        return;
      }
    }

    // 6. Build update query dynamically
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex}`);
      values.push(name);
      paramIndex++;
    }
    if (price !== undefined) {
      setClauses.push(`price_cents = $${paramIndex}`);
      values.push(price);
      paramIndex++;
    }
    if (categoryId !== undefined) {
      setClauses.push(`category_id = $${paramIndex}`);
      values.push(categoryId);
      paramIndex++;
    }

    values.push(id);

    // 7. Execute update
    const updateResult = await pool.query(
      `UPDATE menu_items SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, name, price_cents, status, created_at, updated_at, category_id`,
      values
    );

    if (updateResult.rows.length === 0) {
      res.status(500).json({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao atualizar item.',
      });
      return;
    }

    const updated = updateResult.rows[0];

    // Get category name
    const catNameResult = await pool.query(
      `SELECT name FROM categories WHERE id = $1`,
      [updated.category_id]
    );

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      price: updated.price_cents,
      category: catNameResult.rows[0]?.name || category || '',
      status: updated.status,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  } catch {
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao atualizar item.',
    });
  }
}

/**
 * DELETE /api/menu/:id
 * Delete a menu item if it has no associated order items.
 */
export async function deleteMenuItem(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // 1. Check item exists
    const itemResult = await pool.query(
      `SELECT id FROM menu_items WHERE id = $1`,
      [id]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Item não encontrado.',
      });
      return;
    }

    // 2. Guard: check for associated order items
    const orderItemsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM order_items WHERE menu_item_id = $1`,
      [id]
    );

    if (orderItemsResult.rows[0].count > 0) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Item possui pedidos associados. Desative o item em vez de excluí-lo.',
      });
      return;
    }

    // 3. Delete item
    await pool.query(`DELETE FROM menu_items WHERE id = $1`, [id]);

    res.status(200).json({
      message: 'Item excluído com sucesso',
    });
  } catch (err) {
    console.error('[menu] deleteMenuItem error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao excluir item.',
    });
  }
}

/**
 * PATCH /api/menu/:id/status
 * Toggle item status between 'ativo' and 'inativo'.
 * If body contains { status }, uses that value. Otherwise toggles automatically.
 */
export async function toggleMenuItemStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Check item exists
    const itemResult = await pool.query(
      `SELECT mi.id, mi.name, mi.status, mi.price_cents, mi.created_at, mi.updated_at, c.name AS category_name
       FROM menu_items mi LEFT JOIN categories c ON mi.category_id = c.id
       WHERE mi.id = $1`,
      [id]
    );

    if (itemResult.rows.length === 0) {
      res.status(404).json({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Item não encontrado.',
      });
      return;
    }

    const existingItem = itemResult.rows[0];

    // Determine new status: use body.status if provided, otherwise toggle
    let newStatus: string;
    if (req.body.status && ['ativo', 'inativo'].includes(req.body.status)) {
      newStatus = req.body.status;
    } else {
      newStatus = existingItem.status === 'ativo' ? 'inativo' : 'ativo';
    }

    // If activating, check name uniqueness among other active items
    if (newStatus === 'ativo' && existingItem.status === 'inativo') {
      const collisionResult = await pool.query(
        `SELECT id FROM menu_items WHERE LOWER(name) = LOWER($1) AND status = 'ativo' AND id != $2`,
        [existingItem.name, id]
      );

      if (collisionResult.rows.length > 0) {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Item com este nome já existe',
        });
        return;
      }
    }

    // Update status
    const updateResult = await pool.query(
      `UPDATE menu_items SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, price_cents, status, created_at, updated_at`,
      [newStatus, id]
    );

    const updated = updateResult.rows[0];

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      price: updated.price_cents,
      category: existingItem.category_name || '',
      status: updated.status,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    });
  } catch (err) {
    console.error('[menu] toggleMenuItemStatus error:', err);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro ao atualizar status.',
    });
  }
}
