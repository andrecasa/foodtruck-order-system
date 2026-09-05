import { Response } from 'express';
import { ZodError } from 'zod';
import type { AdminRequest } from '../middleware/role.middleware.js';
import type { TenantContext } from '../middleware/tenant.middleware.js';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  toggleStatusSchema,
} from '../validation/user.validation.js';
import * as userService from '../services/user.service.js';
import type { UserRecord } from '../services/user.service.js';
import { parseBody } from '../http/parse-body.js';

/**
 * Admin request that also carries the tenant resolved by `tenantMiddleware`
 * (which runs before the controllers). `tenantId` is guaranteed present because
 * the user routes chain `tenantMiddleware` before the handlers.
 */
interface TenantAdminRequest extends AdminRequest {
  tenantId?: string;
  tenantContext?: TenantContext;
}

/**
 * Extracts the resolved tenant id from the request. The tenant middleware
 * guarantees this is set on business routes; if it is somehow missing we fail
 * loudly rather than run an unscoped query.
 */
function requireTenantId(req: TenantAdminRequest): string {
  const tenantId = req.tenantId;
  if (!tenantId) {
    throw new userService.ServiceError(
      'Contexto de tenant ausente.',
      500,
      'INTERNAL_ERROR',
    );
  }
  return tenantId;
}

// --- Response mapping ---

interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function mapUserToResponse(user: UserRecord): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

// Erros de validação/negócio são lançados como ServiceError e mapeados
// centralmente pelo errorHandler (src/http/error-handler.js). As rotas
// envolvem estes handlers em asyncHandler para encaminhar rejeições.

function mapZodErrorForCreate(error: ZodError): string {
  const missingFields: string[] = [];
  for (const issue of error.issues) {
    if (issue.code === 'invalid_type' && issue.received === 'undefined') {
      const fieldName = issue.path[issue.path.length - 1];
      if (fieldName) {
        missingFields.push(String(fieldName));
      }
    }
  }

  if (missingFields.length > 0) {
    return `Campos obrigatórios faltando: ${missingFields.join(', ')}`;
  }

  return error.issues[0]?.message || 'Dados inválidos';
}

// --- Handlers ---

/**
 * POST /api/users
 * Creates a new user.
 */
export async function createUser(req: TenantAdminRequest, res: Response): Promise<void> {
  const data = parseBody(createUserSchema, req.body, mapZodErrorForCreate);

  const user = await userService.createUser(requireTenantId(req), data);

  res.status(201).json(mapUserToResponse(user));
}

/**
 * GET /api/users
 * Lists all users with optional filters.
 */
export async function listUsers(req: TenantAdminRequest, res: Response): Promise<void> {
  const filters: userService.ListUsersFilters = {};

  const { role, status } = req.query;

  if (role && typeof role === 'string' && ['admin', 'atendente', 'preparador'].includes(role)) {
    filters.role = role as userService.ListUsersFilters['role'];
  }

  if (status && typeof status === 'string' && ['ativo', 'inativo'].includes(status)) {
    filters.status = status as userService.ListUsersFilters['status'];
  }

  const users = await userService.listUsers(requireTenantId(req), filters);

  res.status(200).json({
    users: users.map(mapUserToResponse),
    total: users.length,
  });
}

/**
 * GET /api/users/:id
 * Retrieves a user by ID.
 */
export async function getUserById(req: TenantAdminRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const user = await userService.getUserById(requireTenantId(req), id);

  if (!user) {
    throw new userService.ServiceError('Usuário não encontrado', 404, 'NOT_FOUND');
  }

  res.status(200).json(mapUserToResponse(user));
}

/**
 * PUT /api/users/:id
 * Updates an existing user.
 */
export async function updateUser(req: TenantAdminRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const data = parseBody(updateUserSchema, req.body);

  const requesterId = req.user?.id || '';

  const user = await userService.updateUser(requireTenantId(req), id, data, requesterId);

  res.status(200).json(mapUserToResponse(user));
}

/**
 * PATCH /api/users/:id/status
 * Toggles user status between 'ativo' and 'inativo'.
 */
export async function toggleUserStatus(req: TenantAdminRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const data = parseBody(toggleStatusSchema, req.body);

  const { status } = data;
  const requesterId = req.user?.id || '';
  const tenantId = requireTenantId(req);

  let user: UserRecord;

  if (status === 'inativo') {
    user = await userService.deactivateUser(tenantId, id, requesterId);
  } else {
    user = await userService.activateUser(tenantId, id);
  }

  res.status(200).json(mapUserToResponse(user));
}

/**
 * DELETE /api/users/:id
 * Permanently deletes a user.
 */
export async function deleteUser(req: TenantAdminRequest, res: Response): Promise<void> {
  const id = req.params.id as string;
  const requesterId = req.user?.id || '';

  await userService.deleteUser(requireTenantId(req), id, requesterId);

  res.status(200).json({ message: 'Usuário excluído com sucesso' });
}

/**
 * PATCH /api/users/:id/password
 * Resets a user's password.
 */
export async function resetPassword(req: TenantAdminRequest, res: Response): Promise<void> {
  const id = req.params.id as string;

  const data = parseBody(resetPasswordSchema, req.body);

  await userService.resetPassword(requireTenantId(req), id, data.password);

  res.status(200).json({ message: 'Senha redefinida com sucesso' });
}
