import { pool } from '../config/database.js';

// --- Interfaces ---

export interface CategoryRecord {
  id: string;
  name: string;
  sortOrder: number;
  status: string;
  itemCount?: number;
  createdAt: string;
}

// --- Error classes ---

export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

// --- Helpers ---

function mapCategoryRow(row: Record<string, unknown>): CategoryRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}

function mapCategoryWithCountRow(row: Record<string, unknown>): CategoryRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    status: row.status as string,
    itemCount: row.item_count as number,
    createdAt: row.created_at as string,
  };
}

// --- Service functions ---

/**
 * Returns all categories with item count, sorted by sort_order ASC then name ASC.
 */
export async function listCategories(): Promise<CategoryRecord[]> {
  const result = await pool.query(
    `SELECT c.id, c.name, c.sort_order, c.status, c.created_at,
            COUNT(mi.id)::int AS item_count
     FROM categories c
     LEFT JOIN menu_items mi ON mi.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`
  );

  return result.rows.map(mapCategoryWithCountRow);
}

/**
 * Creates a new category.
 * Validates name uniqueness (case-insensitive).
 */
export async function createCategory(name: string): Promise<CategoryRecord> {
  // Check name uniqueness (case-insensitive)
  const existingResult = await pool.query(
    `SELECT id FROM categories WHERE LOWER(name) = LOWER($1)`,
    [name]
  );

  if (existingResult.rows.length > 0) {
    throw new ServiceError(
      'Já existe uma categoria com este nome',
      409,
      'CONFLICT',
    );
  }

  // Compute sort_order (max + 1 or 0)
  const maxResult = await pool.query(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM categories`
  );
  const sortOrder = maxResult.rows[0].max_sort_order + 1;

  // Insert category
  const insertResult = await pool.query(
    `INSERT INTO categories (name, sort_order, status)
     VALUES ($1, $2, 'ativo')
     RETURNING id, name, sort_order, status, created_at`,
    [name, sortOrder]
  );

  return mapCategoryRow(insertResult.rows[0]);
}

/**
 * Updates a category name.
 * Validates category exists and name uniqueness (case-insensitive, excluding self).
 */
export async function updateCategory(id: string, name: string): Promise<CategoryRecord> {
  // Check category exists
  const existResult = await pool.query(
    `SELECT id, name, sort_order, created_at FROM categories WHERE id = $1`,
    [id]
  );

  if (existResult.rows.length === 0) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  // Check name uniqueness excluding self (case-insensitive)
  const duplicateResult = await pool.query(
    `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND id != $2`,
    [name, id]
  );

  if (duplicateResult.rows.length > 0) {
    throw new ServiceError(
      'Já existe uma categoria com este nome',
      409,
      'CONFLICT',
    );
  }

  // Update name
  const updateResult = await pool.query(
    `UPDATE categories SET name = $1 WHERE id = $2
     RETURNING id, name, sort_order, created_at`,
    [name, id]
  );

  const row = updateResult.rows[0];

  return {
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  } as CategoryRecord;
}

/**
 * Reorders all categories atomically using a transaction.
 * Validates: no duplicates, all IDs exist, count matches total.
 */
export async function reorderCategories(categoryIds: string[]): Promise<CategoryRecord[]> {
  // Check for duplicates
  const uniqueIds = new Set(categoryIds);
  if (uniqueIds.size !== categoryIds.length) {
    throw new ServiceError(
      'Lista contém categorias duplicadas',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Get all existing categories
  const existingResult = await pool.query(`SELECT id FROM categories`);
  const existingIds = new Set(existingResult.rows.map((row) => row.id));

  // Check all IDs exist
  for (const categoryId of categoryIds) {
    if (!existingIds.has(categoryId)) {
      throw new ServiceError(
        'Categoria não encontrada na lista',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // Check count matches total
  if (categoryIds.length !== existingIds.size) {
    throw new ServiceError(
      'A lista deve conter todas as categorias',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Update sort_order in transaction
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

  // Return updated list
  const updatedResult = await pool.query(
    `SELECT c.id, c.name, c.sort_order, c.status, c.created_at,
            COUNT(mi.id)::int AS item_count
     FROM categories c
     LEFT JOIN menu_items mi ON mi.category_id = c.id
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`
  );

  return updatedResult.rows.map(mapCategoryWithCountRow);
}

/**
 * Toggles category status between 'ativo' and 'inativo'.
 * For deactivation: validates not already inactive, checks no active menu items.
 * For activation: validates not already active.
 */
export async function toggleCategoryStatus(id: string, action: string): Promise<CategoryRecord> {
  // Check category exists
  const categoryResult = await pool.query(
    `SELECT id, name, sort_order, status, created_at FROM categories WHERE id = $1`,
    [id]
  );

  if (categoryResult.rows.length === 0) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  const category = categoryResult.rows[0];

  if (action === 'deactivate') {
    if (category.status === 'inativo') {
      throw new ServiceError(
        'Categoria já está inativa',
        422,
        'VALIDATION_ERROR',
      );
    }

    // Guard: check for active menu items
    const activeItemsResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1 AND status = 'ativo'`,
      [id]
    );

    if (activeItemsResult.rows[0].count > 0) {
      throw new ServiceError(
        'Categoria possui itens ativos. Desative os itens antes de desativar a categoria',
        422,
        'VALIDATION_ERROR',
      );
    }

    const updateResult = await pool.query(
      `UPDATE categories SET status = 'inativo' WHERE id = $1
       RETURNING id, name, sort_order, status, created_at`,
      [id]
    );

    return mapCategoryRow(updateResult.rows[0]);
  } else if (action === 'activate') {
    if (category.status === 'ativo') {
      throw new ServiceError(
        'Categoria já está ativa',
        422,
        'VALIDATION_ERROR',
      );
    }

    const updateResult = await pool.query(
      `UPDATE categories SET status = 'ativo' WHERE id = $1
       RETURNING id, name, sort_order, status, created_at`,
      [id]
    );

    return mapCategoryRow(updateResult.rows[0]);
  } else {
    throw new ServiceError(
      'Ação inválida. Use "activate" ou "deactivate"',
      422,
      'VALIDATION_ERROR',
    );
  }
}

/**
 * Deletes a category if it has no associated menu items.
 */
export async function deleteCategory(id: string): Promise<void> {
  // Check category exists
  const categoryResult = await pool.query(
    `SELECT id FROM categories WHERE id = $1`,
    [id]
  );

  if (categoryResult.rows.length === 0) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  // Guard: check for associated menu items (any status)
  const itemsResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM menu_items WHERE category_id = $1`,
    [id]
  );

  if (itemsResult.rows[0].count > 0) {
    throw new ServiceError(
      'Categoria possui itens associados. Mova ou exclua os itens antes de excluir a categoria',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Delete category
  await pool.query(`DELETE FROM categories WHERE id = $1`, [id]);
}
