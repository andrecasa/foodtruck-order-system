import { tenantRepository } from '../db/tenant-repository.js';

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
 * Returns all categories of the tenant with item count, sorted by sort_order
 * ASC then name ASC. All access is scoped to `tenantId` (R6.1).
 */
export async function listCategories(tenantId: string): Promise<CategoryRecord[]> {
  const repo = tenantRepository(tenantId);

  // tenant_id is $1 (required by raw()); the LEFT JOIN also filters menu_items
  // by the same tenant so counts never include other tenants' rows.
  const rows = await repo.raw<Record<string, unknown>>(
    `SELECT c.id, c.name, c.sort_order, c.status, c.created_at,
            COUNT(mi.id)::int AS item_count
     FROM categories c
     LEFT JOIN menu_items mi ON mi.category_id = c.id AND mi.tenant_id = $1
     WHERE c.tenant_id = $1
     GROUP BY c.id
     ORDER BY c.sort_order ASC, c.name ASC`,
    [tenantId],
  );

  return rows.map(mapCategoryWithCountRow);
}

/**
 * Creates a new category within the tenant.
 * Validates name uniqueness (case-insensitive) within the tenant.
 */
export async function createCategory(tenantId: string, name: string): Promise<CategoryRecord> {
  const repo = tenantRepository(tenantId);

  // Check name uniqueness (case-insensitive) within the tenant
  const existing = await repo.select<{ id: string }>('categories', {
    where: { text: `LOWER(name) = LOWER($1)`, params: [name] },
  });

  if (existing.length > 0) {
    throw new ServiceError(
      'Já existe uma categoria com este nome',
      409,
      'CONFLICT',
    );
  }

  // Compute sort_order (max + 1 or 0) within the tenant
  const maxRows = await repo.raw<{ max_sort_order: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM categories WHERE tenant_id = $1`,
    [tenantId],
  );
  const sortOrder = (maxRows[0]?.max_sort_order ?? -1) + 1;

  // Insert category (tenant_id injected by the repository)
  const inserted = await repo.insert<Record<string, unknown>>('categories', {
    name,
    sort_order: sortOrder,
    status: 'ativo',
  });

  return mapCategoryRow(inserted);
}

/**
 * Updates a category name within the tenant.
 * Validates category exists (within tenant → 404 otherwise) and name uniqueness
 * (case-insensitive, excluding self) within the tenant. A category from another
 * tenant is treated as not existing (R6.3, R6.4).
 */
export async function updateCategory(tenantId: string, id: string, name: string): Promise<CategoryRecord> {
  const repo = tenantRepository(tenantId);

  // Check category exists within the tenant
  const existing = await repo.findOne<{ id: string }>('categories', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!existing) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  // Check name uniqueness excluding self (case-insensitive) within the tenant
  const duplicates = await repo.select<{ id: string }>('categories', {
    where: { text: `LOWER(name) = LOWER($1) AND id != $2`, params: [name, id] },
  });

  if (duplicates.length > 0) {
    throw new ServiceError(
      'Já existe uma categoria com este nome',
      409,
      'CONFLICT',
    );
  }

  // Update name (scoped to tenant)
  await repo.update('categories', { name }, { text: `id = $1`, params: [id] });

  const row = await repo.findOne<Record<string, unknown>>('categories', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!row) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  return {
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    status: row.status as string,
    createdAt: row.created_at as string,
  };
}

/**
 * Reorders all of the tenant's categories atomically using a transaction.
 * Validates (all scoped to tenant): no duplicates, all IDs exist, count matches total.
 */
export async function reorderCategories(tenantId: string, categoryIds: string[]): Promise<CategoryRecord[]> {
  const repo = tenantRepository(tenantId);

  // Check for duplicates
  const uniqueIds = new Set(categoryIds);
  if (uniqueIds.size !== categoryIds.length) {
    throw new ServiceError(
      'Lista contém categorias duplicadas',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Get all existing categories within the tenant
  const existingRows = await repo.select<{ id: string }>('categories');
  const existingIds = new Set(existingRows.map((row) => row.id));

  // Check all IDs exist within the tenant
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

  // Update sort_order in a transaction (each update scoped to tenant)
  await repo.withTransaction(async (txRepo) => {
    for (let i = 0; i < categoryIds.length; i++) {
      await txRepo.update('categories', { sort_order: i }, { text: `id = $1`, params: [categoryIds[i]] });
    }
  });

  // Return updated list (scoped to tenant)
  return listCategories(tenantId);
}

/**
 * Toggles category status between 'ativo' and 'inativo' within the tenant.
 * For deactivation: validates not already inactive, checks no active menu items.
 * For activation: validates not already active.
 * A category from another tenant is treated as not existing (R6.3, R6.4).
 */
export async function toggleCategoryStatus(tenantId: string, id: string, action: string): Promise<CategoryRecord> {
  const repo = tenantRepository(tenantId);

  // Check category exists within the tenant
  const category = await repo.findOne<{ id: string; status: string }>('categories', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!category) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  if (action === 'deactivate') {
    if (category.status === 'inativo') {
      throw new ServiceError(
        'Categoria já está inativa',
        422,
        'VALIDATION_ERROR',
      );
    }

    // Guard: check for active menu items within the tenant
    const activeItems = await repo.select<{ id: string }>('menu_items', {
      where: { text: `category_id = $1 AND status = 'ativo'`, params: [id] },
    });

    if (activeItems.length > 0) {
      throw new ServiceError(
        'Categoria possui itens ativos. Desative os itens antes de desativar a categoria',
        422,
        'VALIDATION_ERROR',
      );
    }

    await repo.update('categories', { status: 'inativo' }, { text: `id = $1`, params: [id] });
  } else if (action === 'activate') {
    if (category.status === 'ativo') {
      throw new ServiceError(
        'Categoria já está ativa',
        422,
        'VALIDATION_ERROR',
      );
    }

    await repo.update('categories', { status: 'ativo' }, { text: `id = $1`, params: [id] });
  } else {
    throw new ServiceError(
      'Ação inválida. Use "activate" ou "deactivate"',
      422,
      'VALIDATION_ERROR',
    );
  }

  const row = await repo.findOne<Record<string, unknown>>('categories', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!row) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  return mapCategoryRow(row);
}

/**
 * Deletes a category within the tenant if it has no associated menu items.
 * A category from another tenant is treated as not existing (R6.4 → 404).
 */
export async function deleteCategory(tenantId: string, id: string): Promise<void> {
  const repo = tenantRepository(tenantId);

  // Check category exists within the tenant
  const category = await repo.findOne<{ id: string }>('categories', {
    where: { text: `id = $1`, params: [id] },
  });

  if (!category) {
    throw new ServiceError(
      'Categoria não encontrada',
      404,
      'NOT_FOUND',
    );
  }

  // Guard: check for associated menu items (any status) within the tenant
  const items = await repo.select<{ id: string }>('menu_items', {
    where: { text: `category_id = $1`, params: [id] },
  });

  if (items.length > 0) {
    throw new ServiceError(
      'Categoria possui itens associados. Mova ou exclua os itens antes de excluir a categoria',
      422,
      'VALIDATION_ERROR',
    );
  }

  // Delete category (scoped to tenant)
  await repo.delete('categories', { text: `id = $1`, params: [id] });
}
