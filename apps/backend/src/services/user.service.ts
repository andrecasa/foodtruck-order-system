import { supabaseAdmin } from '../config/supabase.js';
import { tenantRepository } from '../db/tenant-repository.js';

// --- Interfaces ---

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'atendente' | 'preparador';
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'atendente' | 'preparador';
  status: 'ativo' | 'inativo';
  created_at: string;
  updated_at: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  role?: 'admin' | 'atendente' | 'preparador';
}

export interface ListUsersFilters {
  role?: 'admin' | 'atendente' | 'preparador';
  status?: 'ativo' | 'inativo';
}

// --- Error classes ---

import { ServiceError } from './service-error.js';
export { ServiceError };

// --- Helpers ---

function mapToUserRecord(row: Record<string, unknown>): UserRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as UserRecord['role'],
    status: row.status as UserRecord['status'],
    created_at: (row.created_at as Date).toISOString(),
    updated_at: (row.updated_at as Date).toISOString(),
  };
}

// --- Service functions ---

/**
 * Creates a new user in Supabase Auth and persists to the local database,
 * scoped to the resolved tenant. Rolls back Supabase Auth creation if the
 * local DB insert fails.
 *
 * Tenant scope: email uniqueness is enforced within the tenant only
 * (Requirements 2.1, 2.5, 2.6); the same email may exist in another tenant.
 * The persisted row carries `tenant_id` via the TenantRepository.
 *
 * Requirements: 2.1, 2.5, 2.6, 4.1, 6.1, 12.4
 */
export async function createUser(tenantId: string, input: CreateUserInput): Promise<UserRecord> {
  const repo = tenantRepository(tenantId);

  // 1. Check email uniqueness (case-insensitive) WITHIN THIS TENANT before
  //    creating in Supabase Auth. The repo already scopes to tenant_id, so the
  //    fragment only needs the case-insensitive email predicate (R2.1/R2.5).
  const existing = await repo.findOne('users', {
    where: { text: 'LOWER(email) = LOWER($1)', params: [input.email] },
  });

  if (existing) {
    throw new ServiceError(
      'Já existe um usuário com este e-mail',
      409,
      'CONFLICT',
    );
  }

  // 2. Create in Supabase Auth first (auth is a platform-level operation, not
  //    tenant-scoped DB access — stays on supabaseAdmin).
  const { data: authData, error: authError } =
    await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });

  if (authError || !authData.user) {
    throw new ServiceError(
      'Falha na criação do usuário',
      502,
      'BAD_GATEWAY',
    );
  }

  const authUserId = authData.user.id;

  // 3. Persist in local database scoped to the tenant. `tenant_id` is injected
  //    by the repository; `email` is stored lowercased for the composite
  //    (tenant_id, LOWER(email)) uniqueness index.
  try {
    const row = await repo.insert<Record<string, unknown>>('users', {
      id: authUserId,
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      status: 'ativo',
      created_at: new Date(),
      updated_at: new Date(),
    });

    return mapToUserRecord(row);
  } catch (dbError) {
    // 4. Rollback: remove from Supabase Auth if local DB insert fails.
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    throw new ServiceError(
      'Erro ao criar usuário',
      500,
      'INTERNAL_ERROR',
    );
  }
}

/**
 * Lists users of the resolved tenant with optional filters by role and status.
 * Results are sorted alphabetically by name (case-insensitive). Only rows whose
 * `tenant_id` matches the tenant are returned (Requirement 6.1).
 *
 * Requirements: 2.5, 6.1, 12.4
 */
export async function listUsers(
  tenantId: string,
  filters: ListUsersFilters = {},
): Promise<UserRecord[]> {
  const repo = tenantRepository(tenantId);

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.role) {
    conditions.push(`role = $${paramIndex}`);
    params.push(filters.role);
    paramIndex++;
  }

  if (filters.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  const rows = await repo.select<Record<string, unknown>>('users', {
    where: conditions.length > 0 ? { text: conditions.join(' AND '), params } : undefined,
    orderBy: 'LOWER(name) ASC',
  });

  return rows.map(mapToUserRecord);
}

/**
 * Retrieves a user by their UUID within the resolved tenant.
 * Returns null if the user is not found in this tenant — a user belonging to
 * another tenant is treated as non-existent (Requirement 6.3 → 404 upstream).
 *
 * Requirements: 6.1, 6.3
 */
export async function getUserById(tenantId: string, id: string): Promise<UserRecord | null> {
  const repo = tenantRepository(tenantId);

  const row = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  return row ? mapToUserRecord(row) : null;
}

/**
 * Updates an existing user's name, email, and/or role within the tenant.
 * - Validates email uniqueness (case-insensitive) within the tenant if changed.
 * - Protects against removing the last active admin OF THIS TENANT.
 * - Syncs email change to Supabase Auth with rollback on failure.
 * - Invalidates sessions when role is changed.
 * A record of another tenant is treated as non-existent → 404 (R6.4).
 *
 * Requirements: 2.1, 2.5, 2.6, 6.1, 6.3, 6.4, 12.4
 */
export async function updateUser(
  tenantId: string,
  id: string,
  input: UpdateUserInput,
  requesterId: string,
): Promise<UserRecord> {
  const repo = tenantRepository(tenantId);

  // 1. Fetch current user (scoped to tenant)
  const currentUser = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  if (!currentUser) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  // 2. Validate email uniqueness within the tenant if email is being changed
  if (input.email && input.email.toLowerCase() !== (currentUser.email as string).toLowerCase()) {
    const emailConflict = await repo.findOne('users', {
      where: { text: 'LOWER(email) = LOWER($1) AND id != $2', params: [input.email, id] },
    });

    if (emailConflict) {
      throw new ServiceError(
        'Já existe um usuário com este e-mail',
        409,
        'CONFLICT',
      );
    }
  }

  // 3. Protect last active admin of the tenant
  if (input.role && input.role !== currentUser.role && currentUser.role === 'admin') {
    const admins = await repo.select<Record<string, unknown>>('users', {
      where: { text: "role = 'admin' AND status = 'ativo'", params: [] },
    });

    if (admins.length <= 1) {
      throw new ServiceError(
        'O sistema deve ter ao menos um administrador',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // 4. Build dynamic SET map
  const setValues: Record<string, unknown> = {};

  if (input.name !== undefined) {
    setValues.name = input.name;
  }

  if (input.email !== undefined) {
    setValues.email = input.email.toLowerCase();
  }

  if (input.role !== undefined) {
    setValues.role = input.role;
  }

  setValues.updated_at = new Date();

  const affected = await repo.update('users', setValues, { text: 'id = $1', params: [id] });

  if (affected === 0) {
    // Row disappeared or belongs to another tenant → treat as not found.
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  const updatedUser = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  // 5. If email changed, update in Supabase Auth (with rollback on failure)
  if (input.email && input.email.toLowerCase() !== (currentUser.email as string).toLowerCase()) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: input.email,
    });

    if (authError) {
      // Rollback local DB change (scoped to tenant)
      await repo.update(
        'users',
        {
          name: currentUser.name,
          email: currentUser.email,
          role: currentUser.role,
          updated_at: currentUser.updated_at,
        },
        { text: 'id = $1', params: [id] },
      );
      throw new ServiceError(
        'Erro ao atualizar usuário',
        500,
        'INTERNAL_ERROR',
      );
    }
  }

  // 6. If role changed, invalidate sessions
  if (input.role && input.role !== currentUser.role) {
    await supabaseAdmin.auth.admin.signOut(id, 'global');
  }

  return mapToUserRecord(updatedUser as Record<string, unknown>);
}

/**
 * Resets a user's password via Supabase Admin API and invalidates all sessions.
 * The user must belong to the resolved tenant (R6.4).
 *
 * Requirements: 6.1, 6.4, 12.4
 */
export async function resetPassword(
  tenantId: string,
  id: string,
  newPassword: string,
): Promise<void> {
  const repo = tenantRepository(tenantId);

  // 1. Check user exists within the tenant
  const user = await repo.findOne('users', {
    where: { text: 'id = $1', params: [id] },
  });

  if (!user) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  // 2. Update password in Supabase Auth
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: newPassword,
  });

  if (authError) {
    throw new ServiceError(
      'Erro ao redefinir senha',
      500,
      'INTERNAL_ERROR',
    );
  }

  // 3. Invalidate all sessions
  await supabaseAdmin.auth.admin.signOut(id, 'global');
}

/**
 * Deactivates a user (status → 'inativo') within the tenant and invalidates
 * sessions. Protects the last active admin OF THIS TENANT.
 *
 * Requirements: 6.1, 6.4, 12.4
 */
export async function deactivateUser(
  tenantId: string,
  id: string,
  requesterId: string,
): Promise<UserRecord> {
  const repo = tenantRepository(tenantId);

  // 1. Find user (scoped to tenant)
  const user = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  if (!user) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  // 2. Check if already inactive
  if (user.status === 'inativo') {
    throw new ServiceError('Usuário já está inativo', 422, 'VALIDATION_ERROR');
  }

  // 3. Prevent self-deactivation
  if (id === requesterId) {
    throw new ServiceError('Não é possível desativar o próprio usuário', 422, 'VALIDATION_ERROR');
  }

  // 4. If admin, check if last active admin of the tenant
  if (user.role === 'admin') {
    const admins = await repo.select<Record<string, unknown>>('users', {
      where: { text: "role = 'admin' AND status = 'ativo'", params: [] },
    });

    if (admins.length <= 1) {
      throw new ServiceError(
        'O sistema deve ter ao menos um administrador ativo',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // 5. Update status to inativo
  await repo.update('users', { status: 'inativo', updated_at: new Date() }, {
    text: 'id = $1',
    params: [id],
  });

  const updated = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  // 6. Invalidate sessions in Supabase Auth
  await supabaseAdmin.auth.admin.signOut(id, 'global');

  return mapToUserRecord(updated as Record<string, unknown>);
}

/**
 * Activates a user (status → 'ativo') within the tenant.
 *
 * Requirements: 6.1, 6.4, 12.4
 */
export async function activateUser(tenantId: string, id: string): Promise<UserRecord> {
  const repo = tenantRepository(tenantId);

  // 1. Find user (scoped to tenant)
  const user = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  if (!user) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  // 2. Check if already active
  if (user.status === 'ativo') {
    throw new ServiceError('Usuário já está ativo', 422, 'VALIDATION_ERROR');
  }

  // 3. Update status to ativo
  await repo.update('users', { status: 'ativo', updated_at: new Date() }, {
    text: 'id = $1',
    params: [id],
  });

  const updated = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  return mapToUserRecord(updated as Record<string, unknown>);
}

/**
 * Permanently deletes a user from both the local database and Supabase Auth,
 * scoped to the resolved tenant. Implements best-effort rollback on partial
 * deletion. A record of another tenant is treated as non-existent → 404.
 *
 * Requirements: 6.1, 6.4, 12.4
 */
export async function deleteUser(
  tenantId: string,
  id: string,
  requesterId: string,
): Promise<void> {
  const repo = tenantRepository(tenantId);

  // 1. Find user (scoped to tenant)
  const user = await repo.findOne<Record<string, unknown>>('users', {
    where: { text: 'id = $1', params: [id] },
  });

  if (!user) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  // 2. Prevent self-deletion
  if (id === requesterId) {
    throw new ServiceError('Não é permitido excluir o próprio usuário', 422, 'VALIDATION_ERROR');
  }

  // 3. If active admin, check if last active admin of the tenant
  if (user.role === 'admin' && user.status === 'ativo') {
    const admins = await repo.select<Record<string, unknown>>('users', {
      where: { text: "role = 'admin' AND status = 'ativo'", params: [] },
    });

    if (admins.length <= 1) {
      throw new ServiceError(
        'O sistema deve ter ao menos um administrador ativo',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // 4. Check for associated orders within the tenant
  const orders = await repo.select<Record<string, unknown>>('orders', {
    where: { text: 'created_by = $1', params: [id] },
  });

  if (orders.length > 0) {
    throw new ServiceError(
      'Usuário possui pedidos associados. Desative o usuário em vez de excluí-lo',
      422,
      'VALIDATION_ERROR',
    );
  }

  // 5. Delete from Supabase Auth first
  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(id);

  if (authDeleteError) {
    throw new ServiceError('Erro na exclusão', 500, 'INTERNAL_ERROR');
  }

  // 6. Delete from local database (scoped to tenant)
  try {
    await repo.delete('users', { text: 'id = $1', params: [id] });
  } catch {
    // 7. Rollback: attempt to recreate in Supabase Auth (best effort)
    try {
      await supabaseAdmin.auth.admin.createUser({
        email: user.email as string,
        email_confirm: true,
      });
    } catch {
      // Best effort rollback - ignore if it fails
    }
    throw new ServiceError('Erro na exclusão', 500, 'INTERNAL_ERROR');
  }
}
