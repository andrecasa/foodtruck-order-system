import { Response } from 'express';
import {
  createMenuItemRequestSchema,
  updateMenuItemRequestSchema,
} from '@order-system/shared';
import { pool } from '../config/database.js';
import { supabaseAdmin } from '../config/supabase.js';
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
         WHERE mi.status = 'ativo'
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

    // 3. Check category exists
    const { data: categoryData, error: catError } = await supabaseAdmin
      .from('categories')
      .select('id')
      .eq('name', category)
      .single();

    if (catError || !categoryData) {
      res.status(422).json({
        statusCode: 422,
        error: 'VALIDATION_ERROR',
        message: 'Categoria inválida',
      });
      return;
    }

    // 4. Check name uniqueness (case-insensitive) among active items
    const { data: existing } = await supabaseAdmin
      .from('menu_items')
      .select('id')
      .ilike('name', name)
      .eq('status', 'ativo');

    if (existing && existing.length > 0) {
      res.status(409).json({
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Item com este nome já existe',
      });
      return;
    }

    // 5. Insert item
    const { data: newItem, error: insertError } = await supabaseAdmin
      .from('menu_items')
      .insert({
        name,
        price_cents: price,
        category_id: categoryData.id,
        status: 'ativo',
      })
      .select('id, name, price_cents, status, created_at, updated_at, category_id, categories(name)')
      .single();

    if (insertError) {
      // Handle unique constraint violation from the DB index as a fallback
      if (insertError.code === '23505') {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Item com este nome já existe',
        });
        return;
      }
      res.status(500).json({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao criar item.',
      });
      return;
    }

    const cat = newItem.categories as unknown as { name: string } | null;

    res.status(201).json({
      id: newItem.id,
      name: newItem.name,
      price: newItem.price_cents,
      category: cat?.name || category,
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
    const { data: existingItem, error: fetchError } = await supabaseAdmin
      .from('menu_items')
      .select('id, status')
      .eq('id', id)
      .single();

    if (fetchError || !existingItem) {
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
      const { data: catData, error: catError } = await supabaseAdmin
        .from('categories')
        .select('id')
        .eq('name', category)
        .single();

      if (catError || !catData) {
        res.status(422).json({
          statusCode: 422,
          error: 'VALIDATION_ERROR',
          message: 'Categoria inválida',
        });
        return;
      }
      categoryId = catData.id;
    }

    // 5. If name provided, check collision with other active items (excluding this one)
    if (name !== undefined) {
      const { data: collision } = await supabaseAdmin
        .from('menu_items')
        .select('id')
        .ilike('name', name)
        .eq('status', 'ativo')
        .neq('id', id);

      if (collision && collision.length > 0) {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Item com este nome já existe',
        });
        return;
      }
    }

    // 6. Build update payload (never change ID)
    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (name !== undefined) updatePayload.name = name;
    if (price !== undefined) updatePayload.price_cents = price;
    if (categoryId !== undefined) updatePayload.category_id = categoryId;

    // 7. Execute update
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('menu_items')
      .update(updatePayload)
      .eq('id', id)
      .select('id, name, price_cents, status, created_at, updated_at, category_id, categories(name)')
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        res.status(409).json({
          statusCode: 409,
          error: 'CONFLICT',
          message: 'Item com este nome já existe',
        });
        return;
      }
      res.status(500).json({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao atualizar item.',
      });
      return;
    }

    const cat = updated.categories as unknown as { name: string } | null;

    res.status(200).json({
      id: updated.id,
      name: updated.name,
      price: updated.price_cents,
      category: cat?.name || category || '',
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
