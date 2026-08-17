import { pool } from '../config/database.js';

// --- Interfaces ---

export interface MenuItemRecord {
  id: string;
  name: string;
  price: number;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface MenuGroup {
  category: string;
  items: MenuItemRecord[];
}

export interface CreateMenuItemInput {
  name: string;
  price: number;
  category: string;
}

export interface UpdateMenuItemInput {
  name?: string;
  price?: number;
  category?: string;
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

// --- Service functions ---

/**
 * Returns menu items grouped by category.
 * If showAll is false, only active items in active categories are returned.
 */
export async function getMenu(showAll: boolean): Promise<MenuGroup[]> {
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
  const grouped: Record<string, { category: string; sortOrder: number; items: MenuItemRecord[] }> = {};

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

  return Object.values(grouped)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ category, items }) => ({
      category,
      items,
    }));
}

/**
 * Creates a new menu item.
 * Validates: category exists and is active, name uniqueness among active items, price > 0.
 */
export async function createMenuItem(input: CreateMenuItemInput): Promise<MenuItemRecord> {
  const { name, price, category } = input;

  // Check price > 0
  if (price <= 0) {
    throw new ServiceError(
      'Preço deve ser maior que zero',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Check category exists (case-insensitive, active only)
  const categoryResult = await pool.query(
    `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND status = 'ativo' LIMIT 1`,
    [category]
  );

  if (categoryResult.rows.length === 0) {
    throw new ServiceError(
      'Categoria inválida',
      422,
      'VALIDATION_ERROR',
    );
  }

  const categoryData = categoryResult.rows[0];

  // Check name uniqueness (case-insensitive) among active items
  const existingResult = await pool.query(
    `SELECT id FROM menu_items WHERE LOWER(name) = LOWER($1) AND status = 'ativo'`,
    [name]
  );

  if (existingResult.rows.length > 0) {
    throw new ServiceError(
      'Item com este nome já existe',
      409,
      'CONFLICT',
    );
  }

  // Insert item
  const insertResult = await pool.query(
    `INSERT INTO menu_items (name, price_cents, category_id, status)
     VALUES ($1, $2, $3, 'ativo')
     RETURNING id, name, price_cents, status, created_at, updated_at, category_id`,
    [name, price, categoryData.id]
  );

  if (insertResult.rows.length === 0) {
    throw new ServiceError(
      'Erro ao criar item.',
      500,
      'INTERNAL_ERROR',
    );
  }

  const newItem = insertResult.rows[0];

  // Get category name
  const catNameResult = await pool.query(
    `SELECT name FROM categories WHERE id = $1`,
    [newItem.category_id]
  );
  const catName = catNameResult.rows[0]?.name || category;

  return {
    id: newItem.id,
    name: newItem.name,
    price: newItem.price_cents,
    category: catName,
    status: newItem.status,
    createdAt: newItem.created_at,
    updatedAt: newItem.updated_at,
  };
}

/**
 * Updates a menu item.
 * Validates: item exists, price > 0, category exists if provided, name uniqueness if changed.
 */
export async function updateMenuItem(id: string, input: UpdateMenuItemInput): Promise<MenuItemRecord> {
  const { name, price, category } = input;

  // Check item exists
  const itemResult = await pool.query(
    `SELECT id, status FROM menu_items WHERE id = $1`,
    [id]
  );

  if (itemResult.rows.length === 0) {
    throw new ServiceError(
      'Item não encontrado.',
      404,
      'NOT_FOUND',
    );
  }

  // If price provided, validate > 0
  if (price !== undefined && price <= 0) {
    throw new ServiceError(
      'Preço deve ser maior que zero',
      422,
      'VALIDATION_ERROR',
    );
  }

  // If category provided, validate it exists
  let categoryId: string | undefined;
  if (category !== undefined) {
    const catResult = await pool.query(
      `SELECT id FROM categories WHERE LOWER(name) = LOWER($1) AND status = 'ativo' LIMIT 1`,
      [category]
    );

    if (catResult.rows.length === 0) {
      throw new ServiceError(
        'Categoria inválida',
        422,
        'VALIDATION_ERROR',
      );
    }
    categoryId = catResult.rows[0].id;
  }

  // If name provided, check collision with other active items (excluding this one)
  if (name !== undefined) {
    const collisionResult = await pool.query(
      `SELECT id FROM menu_items WHERE LOWER(name) = LOWER($1) AND status = 'ativo' AND id != $2`,
      [name, id]
    );

    if (collisionResult.rows.length > 0) {
      throw new ServiceError(
        'Item com este nome já existe',
        409,
        'CONFLICT',
      );
    }
  }

  // Build update query dynamically
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

  // Execute update
  const updateResult = await pool.query(
    `UPDATE menu_items SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
     RETURNING id, name, price_cents, status, created_at, updated_at, category_id`,
    values
  );

  if (updateResult.rows.length === 0) {
    throw new ServiceError(
      'Erro ao atualizar item.',
      500,
      'INTERNAL_ERROR',
    );
  }

  const updated = updateResult.rows[0];

  // Get category name
  const catNameResult = await pool.query(
    `SELECT name FROM categories WHERE id = $1`,
    [updated.category_id]
  );

  return {
    id: updated.id,
    name: updated.name,
    price: updated.price_cents,
    category: catNameResult.rows[0]?.name || category || '',
    status: updated.status,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

/**
 * Deletes a menu item if it has no associated order items.
 */
export async function deleteMenuItem(id: string): Promise<void> {
  // Check item exists
  const itemResult = await pool.query(
    `SELECT id FROM menu_items WHERE id = $1`,
    [id]
  );

  if (itemResult.rows.length === 0) {
    throw new ServiceError(
      'Item não encontrado.',
      404,
      'NOT_FOUND',
    );
  }

  // Guard: check for associated order items
  const orderItemsResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM order_items WHERE menu_item_id = $1`,
    [id]
  );

  if (orderItemsResult.rows[0].count > 0) {
    throw new ServiceError(
      'Item possui pedidos associados. Desative o item em vez de excluí-lo.',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Delete item
  await pool.query(`DELETE FROM menu_items WHERE id = $1`, [id]);
}

/**
 * Toggles item status between 'ativo' and 'inativo'.
 * If activating, checks name uniqueness among other active items.
 */
export async function toggleMenuItemStatus(id: string, requestedStatus?: string): Promise<MenuItemRecord> {
  // Check item exists
  const itemResult = await pool.query(
    `SELECT mi.id, mi.name, mi.status, mi.price_cents, mi.created_at, mi.updated_at, c.name AS category_name
     FROM menu_items mi LEFT JOIN categories c ON mi.category_id = c.id
     WHERE mi.id = $1`,
    [id]
  );

  if (itemResult.rows.length === 0) {
    throw new ServiceError(
      'Item não encontrado.',
      404,
      'NOT_FOUND',
    );
  }

  const existingItem = itemResult.rows[0];

  // Determine new status: use requestedStatus if valid, otherwise toggle
  let newStatus: string;
  if (requestedStatus && ['ativo', 'inativo'].includes(requestedStatus)) {
    newStatus = requestedStatus;
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
      throw new ServiceError(
        'Item com este nome já existe',
        409,
        'CONFLICT',
      );
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

  return {
    id: updated.id,
    name: updated.name,
    price: updated.price_cents,
    category: existingItem.category_name || '',
    status: updated.status,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}
