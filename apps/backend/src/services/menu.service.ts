import { tenantRepository } from '../db/tenant-repository.js';

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
  /**
   * Category `sort_order` (ascending). Preserved so downstream consumers (e.g.
   * the public menu DTO — customer-ordering R2.4) can expose the ordering
   * explicitly instead of relying on the implicit array order. Groups are
   * already returned pre-sorted by this value.
   */
  sortOrder: number;
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
 * Returns menu items grouped by category for the given tenant.
 * If showAll is false, only active items in active categories are returned.
 * All access is scoped to `tenantId` via the TenantRepository (R6.1).
 */
export async function getMenu(tenantId: string, showAll: boolean): Promise<MenuGroup[]> {
  const repo = tenantRepository(tenantId);

  // tenant_id is $1 (required by raw()); the JOIN also filters categories by
  // the same tenant so cross-tenant categories can never leak in.
  const query = showAll
    ? `SELECT mi.id, mi.name, mi.price_cents, mi.status, mi.created_at, mi.updated_at,
              c.name AS category_name, c.sort_order AS category_sort_order
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.id AND c.tenant_id = $1
       WHERE mi.tenant_id = $1
       ORDER BY c.sort_order ASC, mi.name ASC`
    : `SELECT mi.id, mi.name, mi.price_cents, mi.status, mi.created_at, mi.updated_at,
              c.name AS category_name, c.sort_order AS category_sort_order
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.id AND c.tenant_id = $1
       WHERE mi.tenant_id = $1 AND mi.status = 'ativo' AND c.status = 'ativo'
       ORDER BY c.sort_order ASC, mi.name ASC`;

  const rows = await repo.raw<Record<string, any>>(query, [tenantId]);

  // Group by category
  const grouped: Record<string, { category: string; sortOrder: number; items: MenuItemRecord[] }> = {};

  for (const row of rows) {
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
    .map(({ category, sortOrder, items }) => ({
      category,
      sortOrder,
      items,
    }));
}

/**
 * Creates a new menu item for the given tenant.
 * Validates: category exists and is active (within tenant), name uniqueness
 * among active items (within tenant), price > 0.
 */
export async function createMenuItem(tenantId: string, input: CreateMenuItemInput): Promise<MenuItemRecord> {
  const { name, price, category } = input;
  const repo = tenantRepository(tenantId);

  // Check price > 0
  if (price <= 0) {
    throw new ServiceError(
      'Preço deve ser maior que zero',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Check category exists (case-insensitive, active only) within the tenant
  const categoryRows = await repo.select<{ id: string }>('categories', {
    where: { text: `LOWER(name) = LOWER($1) AND status = 'ativo'`, params: [category] },
  });

  const categoryData = categoryRows[0];

  if (!categoryData) {
    throw new ServiceError(
      'Categoria inválida',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Check name uniqueness (case-insensitive) among active items within the tenant
  const existing = await repo.select<{ id: string }>('menu_items', {
    where: { text: `LOWER(name) = LOWER($1) AND status = 'ativo'`, params: [name] },
  });

  if (existing.length > 0) {
    throw new ServiceError(
      'Item com este nome já existe',
      409,
      'CONFLICT',
    );
  }

  // Insert item (tenant_id injected by the repository)
  const newItem = await repo.insert<{
    id: string;
    name: string;
    price_cents: number;
    status: string;
    created_at: string;
    updated_at: string;
    category_id: string;
  }>('menu_items', {
    name,
    price_cents: price,
    category_id: categoryData.id,
    status: 'ativo',
  });

  if (!newItem) {
    throw new ServiceError(
      'Erro ao criar item.',
      500,
      'INTERNAL_ERROR',
    );
  }

  // Get category name (scoped to tenant)
  const catRow = await repo.findOne<{ name: string }>('categories', {
    where: { text: `id = $1`, params: [newItem.category_id] },
  });
  const catName = catRow?.name || category;

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
 * Updates a menu item within the given tenant.
 * Validates: item exists (within tenant → 404 otherwise), price > 0, category
 * exists if provided, name uniqueness if changed. A menu item belonging to
 * another tenant is treated as not existing (R6.3, R6.4).
 */
export async function updateMenuItem(
  tenantId: string,
  id: string,
  input: UpdateMenuItemInput,
): Promise<MenuItemRecord> {
  const { name, price, category } = input;
  const repo = tenantRepository(tenantId);

  // Check item exists within the tenant
  const item = await repo.findOne<{ id: string; status: string }>('menu_items', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!item) {
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

  // If category provided, validate it exists within the tenant
  let categoryId: string | undefined;
  if (category !== undefined) {
    const catRow = await repo.findOne<{ id: string }>('categories', {
      where: { text: `LOWER(name) = LOWER($1) AND status = 'ativo'`, params: [category] },
    });

    if (!catRow) {
      throw new ServiceError(
        'Categoria inválida',
        422,
        'VALIDATION_ERROR',
      );
    }
    categoryId = catRow.id;
  }

  // If name provided, check collision with other active items (excluding this one) within the tenant
  if (name !== undefined) {
    const collisions = await repo.select<{ id: string }>('menu_items', {
      where: { text: `LOWER(name) = LOWER($1) AND status = 'ativo' AND id != $2`, params: [name, id] },
    });

    if (collisions.length > 0) {
      throw new ServiceError(
        'Item com este nome já existe',
        409,
        'CONFLICT',
      );
    }
  }

  // Build update set dynamically
  const set: Record<string, unknown> = { updated_at: new Date() };
  if (name !== undefined) set.name = name;
  if (price !== undefined) set.price_cents = price;
  if (categoryId !== undefined) set.category_id = categoryId;

  const affected = await repo.update('menu_items', set, { text: `id = $1`, params: [id] });

  if (affected === 0) {
    throw new ServiceError(
      'Erro ao atualizar item.',
      500,
      'INTERNAL_ERROR',
    );
  }

  // Re-read the updated row (scoped to tenant) to return current values.
  const updated = await repo.findOne<{
    id: string;
    name: string;
    price_cents: number;
    status: string;
    created_at: string;
    updated_at: string;
    category_id: string;
  }>('menu_items', { where: { text: `id = $1`, params: [id] } });

  if (!updated) {
    throw new ServiceError(
      'Erro ao atualizar item.',
      500,
      'INTERNAL_ERROR',
    );
  }

  // Get category name (scoped to tenant)
  const catNameRow = await repo.findOne<{ name: string }>('categories', {
    where: { text: `id = $1`, params: [updated.category_id] },
  });

  return {
    id: updated.id,
    name: updated.name,
    price: updated.price_cents,
    category: catNameRow?.name || category || '',
    status: updated.status,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  };
}

/**
 * Deletes a menu item within the tenant if it has no associated order items.
 * A menu item from another tenant is treated as not existing (R6.4 → 404).
 */
export async function deleteMenuItem(tenantId: string, id: string): Promise<void> {
  const repo = tenantRepository(tenantId);

  // Check item exists within the tenant
  const item = await repo.findOne<{ id: string }>('menu_items', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!item) {
    throw new ServiceError(
      'Item não encontrado.',
      404,
      'NOT_FOUND',
    );
  }

  // Guard: check for associated order items (scoped to tenant)
  const orderItemRows = await repo.select<{ id: string }>('order_items', {
    where: { text: `menu_item_id = $1`, params: [id] },
  });

  if (orderItemRows.length > 0) {
    throw new ServiceError(
      'Item possui pedidos associados. Desative o item em vez de excluí-lo.',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Delete item (scoped to tenant)
  await repo.delete('menu_items', { text: `id = $1`, params: [id] });
}

/**
 * Toggles item status between 'ativo' and 'inativo' within the tenant.
 * If activating, checks name uniqueness among other active items (within tenant).
 * A menu item from another tenant is treated as not existing (R6.4 → 404).
 */
export async function toggleMenuItemStatus(
  tenantId: string,
  id: string,
  requestedStatus?: string,
): Promise<MenuItemRecord> {
  const repo = tenantRepository(tenantId);

  // Check item exists within the tenant (join category scoped to same tenant)
  const itemRows = await repo.raw<{
    id: string;
    name: string;
    status: string;
    price_cents: number;
    created_at: string;
    updated_at: string;
    category_name: string | null;
  }>(
    `SELECT mi.id, mi.name, mi.status, mi.price_cents, mi.created_at, mi.updated_at, c.name AS category_name
     FROM menu_items mi
     LEFT JOIN categories c ON mi.category_id = c.id AND c.tenant_id = $1
     WHERE mi.tenant_id = $1 AND mi.id = $2`,
    [tenantId, id],
  );

  const existingItem = itemRows[0];

  if (!existingItem) {
    throw new ServiceError(
      'Item não encontrado.',
      404,
      'NOT_FOUND',
    );
  }

  // Determine new status: use requestedStatus if valid, otherwise toggle
  let newStatus: string;
  if (requestedStatus && ['ativo', 'inativo'].includes(requestedStatus)) {
    newStatus = requestedStatus;
  } else {
    newStatus = existingItem.status === 'ativo' ? 'inativo' : 'ativo';
  }

  // If activating, check name uniqueness among other active items within the tenant
  if (newStatus === 'ativo' && existingItem.status === 'inativo') {
    const collisions = await repo.select<{ id: string }>('menu_items', {
      where: {
        text: `LOWER(name) = LOWER($1) AND status = 'ativo' AND id != $2`,
        params: [existingItem.name, id],
      },
    });

    if (collisions.length > 0) {
      throw new ServiceError(
        'Item com este nome já existe',
        409,
        'CONFLICT',
      );
    }
  }

  // Update status (scoped to tenant)
  await repo.update(
    'menu_items',
    { status: newStatus, updated_at: new Date() },
    { text: `id = $1`, params: [id] },
  );

  const updated = await repo.findOne<{
    id: string;
    name: string;
    price_cents: number;
    status: string;
    created_at: string;
    updated_at: string;
  }>('menu_items', { where: { text: `id = $1`, params: [id] } });

  if (!updated) {
    throw new ServiceError(
      'Erro ao atualizar status.',
      500,
      'INTERNAL_ERROR',
    );
  }

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
