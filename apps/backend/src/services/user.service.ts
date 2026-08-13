import { pool } from '../config/database.js';
import { supabaseAdmin } from '../config/supabase.js';

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
 * Creates a new user in Supabase Auth and persists to the local database.
 * Rolls back Supabase Auth creation if local DB insert fails.
 *
 * Requirements: 1.1, 1.2, 1.7
 */
export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  // 1. Check email uniqueness (case-insensitive) before creating in Supabase Auth
  const existingUser = await pool.query(
    'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
    [input.email],
  );

  if (existingUser.rows.length > 0) {
    throw new ServiceError(
      'Já existe um usuário com este e-mail',
      409,
      'CONFLICT',
    );
  }

  // 2. Create in Supabase Auth first
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

  // 3. Persist in local database
  try {
    const result = await pool.query(
      `INSERT INTO users (id, name, email, role, status, created_at, updated_at)
       VALUES ($1, $2, LOWER($3), $4, 'ativo', NOW(), NOW())
       RETURNING *`,
      [authUserId, input.name, input.email, input.role],
    );

    return mapToUserRecord(result.rows[0]);
  } catch (dbError) {
    // 4. Rollback: remove from Supabase Auth if local DB insert fails
    await supabaseAdmin.auth.admin.deleteUser(authUserId);
    throw new ServiceError(
      'Erro ao criar usuário',
      500,
      'INTERNAL_ERROR',
    );
  }
}

/**
 * Lists users with optional filters by role and status.
 * Results are sorted alphabetically by name (case-insensitive).
 *
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */
export async function listUsers(filters: ListUsersFilters = {}): Promise<UserRecord[]> {
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

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await pool.query(
    `SELECT * FROM users ${whereClause} ORDER BY LOWER(name) ASC`,
    params,
  );

  return result.rows.map(mapToUserRecord);
}

/**
 * Retrieves a user by their UUID.
 * Returns null if user is not found.
 *
 * Requirements: 3.4
 */
export async function getUserById(id: string): Promise<UserRecord | null> {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapToUserRecord(result.rows[0]);
}

/**
 * Updates an existing user's name, email, and/or role.
 * - Validates email uniqueness (case-insensitive) if email is being changed.
 * - Protects against removing the last active admin.
 * - Syncs email change to Supabase Auth with rollback on failure.
 * - Invalidates sessions when role is changed.
 *
 * Requirements: 3.1, 3.2, 3.5, 3.6, 3.7
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  requesterId: string,
): Promise<UserRecord> {
  // 1. Fetch current user
  const currentResult = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );

  if (currentResult.rows.length === 0) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  const currentUser = currentResult.rows[0];

  // 2. Validate email uniqueness if email is being changed
  if (input.email && input.email.toLowerCase() !== (currentUser.email as string).toLowerCase()) {
    const emailCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
      [input.email, id],
    );

    if (emailCheck.rows.length > 0) {
      throw new ServiceError(
        'Já existe um usuário com este e-mail',
        409,
        'CONFLICT',
      );
    }
  }

  // 3. Protect last active admin
  if (input.role && input.role !== currentUser.role && currentUser.role === 'admin') {
    const adminCount = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'ativo'",
    );

    if (parseInt(adminCount.rows[0].count as string, 10) <= 1) {
      throw new ServiceError(
        'O sistema deve ter ao menos um administrador',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // 4. Build dynamic UPDATE query
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    setClauses.push(`name = $${paramIndex}`);
    params.push(input.name);
    paramIndex++;
  }

  if (input.email !== undefined) {
    setClauses.push(`email = LOWER($${paramIndex})`);
    params.push(input.email);
    paramIndex++;
  }

  if (input.role !== undefined) {
    setClauses.push(`role = $${paramIndex}`);
    params.push(input.role);
    paramIndex++;
  }

  setClauses.push(`updated_at = NOW()`);

  params.push(id);
  const idParam = paramIndex;

  const updateResult = await pool.query(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idParam} RETURNING *`,
    params,
  );

  const updatedUser = updateResult.rows[0];

  // 5. If email changed, update in Supabase Auth (with rollback on failure)
  if (input.email && input.email.toLowerCase() !== (currentUser.email as string).toLowerCase()) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(id, {
      email: input.email,
    });

    if (authError) {
      // Rollback local DB change
      await pool.query(
        `UPDATE users SET name = $1, email = $2, role = $3, updated_at = $4 WHERE id = $5`,
        [
          currentUser.name,
          currentUser.email,
          currentUser.role,
          currentUser.updated_at,
          id,
        ],
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

  return mapToUserRecord(updatedUser);
}

/**
 * Resets a user's password via Supabase Admin API and invalidates all sessions.
 *
 * Requirements: 7.1, 7.4
 */
export async function resetPassword(id: string, newPassword: string): Promise<void> {
  // 1. Check user exists
  const userResult = await pool.query(
    'SELECT id FROM users WHERE id = $1',
    [id],
  );

  if (userResult.rows.length === 0) {
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
 * Deactivates a user by setting their status to 'inativo' and invalidating sessions.
 *
 * Requirements: 4.1, 4.4, 4.5, 4.8
 */
export async function deactivateUser(id: string, requesterId: string): Promise<UserRecord> {
  // 1. Find user
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

  if (userResult.rows.length === 0) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  const user = userResult.rows[0];

  // 2. Check if already inactive
  if (user.status === 'inativo') {
    throw new ServiceError('Usuário já está inativo', 422, 'VALIDATION_ERROR');
  }

  // 3. Prevent self-deactivation
  if (id === requesterId) {
    throw new ServiceError('Não é possível desativar o próprio usuário', 422, 'VALIDATION_ERROR');
  }

  // 4. If admin, check if last active admin
  if (user.role === 'admin') {
    const adminCountResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'ativo'",
    );
    const activeAdminCount = parseInt(adminCountResult.rows[0].count, 10);

    if (activeAdminCount <= 1) {
      throw new ServiceError(
        'O sistema deve ter ao menos um administrador ativo',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // 5. Update status to inativo
  const updateResult = await pool.query(
    `UPDATE users SET status = 'inativo', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );

  // 6. Invalidate sessions in Supabase Auth
  await supabaseAdmin.auth.admin.signOut(id, 'global');

  return mapToUserRecord(updateResult.rows[0]);
}

/**
 * Activates a user by setting their status to 'ativo'.
 *
 * Requirements: 4.2, 4.6
 */
export async function activateUser(id: string): Promise<UserRecord> {
  // 1. Find user
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

  if (userResult.rows.length === 0) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  const user = userResult.rows[0];

  // 2. Check if already active
  if (user.status === 'ativo') {
    throw new ServiceError('Usuário já está ativo', 422, 'VALIDATION_ERROR');
  }

  // 3. Update status to ativo
  const updateResult = await pool.query(
    `UPDATE users SET status = 'ativo', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id],
  );

  return mapToUserRecord(updateResult.rows[0]);
}

/**
 * Permanently deletes a user from both the local database and Supabase Auth.
 * Implements rollback if partial deletion occurs.
 *
 * Requirements: 5.1, 5.2, 5.5, 5.6, 5.7
 */
export async function deleteUser(id: string, requesterId: string): Promise<void> {
  // 1. Find user
  const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [id]);

  if (userResult.rows.length === 0) {
    throw new ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  const user = userResult.rows[0];

  // 2. Prevent self-deletion
  if (id === requesterId) {
    throw new ServiceError('Não é permitido excluir o próprio usuário', 422, 'VALIDATION_ERROR');
  }

  // 3. If active admin, check if last active admin
  if (user.role === 'admin' && user.status === 'ativo') {
    const adminCountResult = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'ativo'",
    );
    const activeAdminCount = parseInt(adminCountResult.rows[0].count, 10);

    if (activeAdminCount <= 1) {
      throw new ServiceError(
        'O sistema deve ter ao menos um administrador ativo',
        422,
        'VALIDATION_ERROR',
      );
    }
  }

  // 4. Check for associated orders
  const ordersResult = await pool.query(
    'SELECT COUNT(*) FROM orders WHERE created_by = $1',
    [id],
  );
  const orderCount = parseInt(ordersResult.rows[0].count, 10);

  if (orderCount > 0) {
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

  // 6. Delete from local database
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  } catch {
    // 7. Rollback: attempt to recreate in Supabase Auth (best effort)
    try {
      await supabaseAdmin.auth.admin.createUser({
        email: user.email,
        email_confirm: true,
      });
    } catch {
      // Best effort rollback - ignore if it fails
    }
    throw new ServiceError('Erro na exclusão', 500, 'INTERNAL_ERROR');
  }
}
