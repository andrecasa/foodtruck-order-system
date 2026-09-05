import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
import type { AdminRequest } from '../../middleware/role.middleware.js';

// Mock the user service module. Reexporta a ServiceError REAL (centralizada em
// service-error.js) — não uma classe local — para que o `instanceof` no
// errorHandler bata e o mapeamento de status funcione após a migração para o
// error middleware.
vi.mock('../../services/user.service.js', async () => {
  const { ServiceError } = await import('../../services/service-error.js');
  return {
    ServiceError,
    createUser: vi.fn(),
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  activateUser: vi.fn(),
    deleteUser: vi.fn(),
    resetPassword: vi.fn(),
  };
});

import {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  resetPassword,
} from '../../controllers/user.controller.js';

import * as userService from '../../services/user.service.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

const mockCreateUser = userService.createUser as ReturnType<typeof vi.fn>;
const mockListUsers = userService.listUsers as ReturnType<typeof vi.fn>;
const mockGetUserById = userService.getUserById as ReturnType<typeof vi.fn>;
const mockUpdateUser = userService.updateUser as ReturnType<typeof vi.fn>;
const mockDeactivateUser = userService.deactivateUser as ReturnType<typeof vi.fn>;
const mockActivateUser = userService.activateUser as ReturnType<typeof vi.fn>;
const mockDeleteUser = userService.deleteUser as ReturnType<typeof vi.fn>;
const mockResetPassword = userService.resetPassword as ReturnType<typeof vi.fn>;

// --- Test helpers ---

const TENANT_ID = 'tenant-a';

function mockRequest(overrides: Partial<AdminRequest> = {}): AdminRequest {
  return {
    body: {},
    params: {},
    query: {},
    user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' as const },
    // tenantMiddleware runs before the controller and sets this on business
    // routes; the controller passes it as the first arg to the service.
    tenantId: TENANT_ID,
    ...overrides,
  } as AdminRequest;
}

function mockResponse(): Response & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

const sampleUserRecord: userService.UserRecord = {
  id: 'user-uuid-1',
  name: 'João Silva',
  email: 'joao@test.com',
  role: 'atendente',
  status: 'ativo',
  created_at: '2024-06-15T10:00:00.000Z',
  updated_at: '2024-06-15T10:00:00.000Z',
};

// --- Tests ---

describe('User Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── createUser ───────────────────────────────────────────────────────────

  describe('createUser', () => {
    const validBody = {
      name: 'João Silva',
      email: 'joao@test.com',
      password: 'senhaForte123',
      role: 'atendente',
    };

    it('should return 201 with user data on success', async () => {
      mockCreateUser.mockResolvedValue(sampleUserRecord);

      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      await invokeHandler(createUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({
        id: 'user-uuid-1',
        name: 'João Silva',
        email: 'joao@test.com',
        role: 'atendente',
        status: 'ativo',
        createdAt: '2024-06-15T10:00:00.000Z',
        updatedAt: '2024-06-15T10:00:00.000Z',
      });
    });

    it('should return 422 listing missing fields when required fields are absent', async () => {
      const req = mockRequest({ body: {} });
      const res = mockResponse();

      await invokeHandler(createUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('Campos obrigatórios faltando');
      expect(res.body.message).toContain('name');
      expect(res.body.message).toContain('email');
      expect(res.body.message).toContain('password');
      expect(res.body.message).toContain('role');
    });

    it('should return 409 when service throws email duplicate error', async () => {
      mockCreateUser.mockRejectedValue(
        new userService.ServiceError('Já existe um usuário com este e-mail', 409, 'CONFLICT'),
      );

      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      await invokeHandler(createUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Já existe um usuário com este e-mail',
      });
    });

    it('should return 502 when Supabase Auth creation fails', async () => {
      mockCreateUser.mockRejectedValue(
        new userService.ServiceError('Falha na criação do usuário', 502, 'BAD_GATEWAY'),
      );

      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      await invokeHandler(createUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(502);
      expect(res.body).toEqual({
        statusCode: 502,
        error: 'BAD_GATEWAY',
        message: 'Falha na criação do usuário',
      });
    });

    it('should return 500 when DB fails after Supabase Auth creation (rollback scenario)', async () => {
      mockCreateUser.mockRejectedValue(
        new userService.ServiceError('Erro ao criar usuário', 500, 'INTERNAL_ERROR'),
      );

      const req = mockRequest({ body: validBody });
      const res = mockResponse();

      await invokeHandler(createUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao criar usuário',
      });
    });
  });

  // ─── getUserById ──────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('should return 200 with user data when user exists', async () => {
      mockGetUserById.mockResolvedValue(sampleUserRecord);

      const req = mockRequest({ params: { id: 'user-uuid-1' } });
      const res = mockResponse();

      await invokeHandler(getUserById, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('user-uuid-1');
      expect(res.body.name).toBe('João Silva');
    });

    it('should return 404 when service returns null', async () => {
      mockGetUserById.mockResolvedValue(null);

      const req = mockRequest({ params: { id: 'nonexistent-id' } });
      const res = mockResponse();

      await invokeHandler(getUserById, req, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Usuário não encontrado',
      });
    });
  });

  // ─── updateUser ───────────────────────────────────────────────────────────

  describe('updateUser', () => {
    it('should return 200 with updated user on success', async () => {
      const updatedUser = { ...sampleUserRecord, name: 'João Atualizado' };
      mockUpdateUser.mockResolvedValue(updatedUser);

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { name: 'João Atualizado' },
      });
      const res = mockResponse();

      await invokeHandler(updateUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('João Atualizado');
      expect(mockUpdateUser).toHaveBeenCalledWith(TENANT_ID, 'user-uuid-1', { name: 'João Atualizado' }, 'admin-1');
    });

    it('should return 422 when body is empty (no fields to update)', async () => {
      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: {},
      });
      const res = mockResponse();

      await invokeHandler(updateUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 409 when email is duplicated', async () => {
      mockUpdateUser.mockRejectedValue(
        new userService.ServiceError('Já existe um usuário com este e-mail', 409, 'CONFLICT'),
      );

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { email: 'duplicado@test.com' },
      });
      const res = mockResponse();

      await invokeHandler(updateUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Já existe um usuário com este e-mail',
      });
    });

    it('should return 404 when user does not exist', async () => {
      mockUpdateUser.mockRejectedValue(
        new userService.ServiceError('Usuário não encontrado', 404, 'NOT_FOUND'),
      );

      const req = mockRequest({
        params: { id: 'nonexistent-id' },
        body: { name: 'Novo Nome' },
      });
      const res = mockResponse();

      await invokeHandler(updateUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Usuário não encontrado',
      });
    });
  });

  // ─── toggleUserStatus ─────────────────────────────────────────────────────

  describe('toggleUserStatus', () => {
    it('should return 200 when deactivation succeeds', async () => {
      const inactiveUser = { ...sampleUserRecord, status: 'inativo' as const };
      mockDeactivateUser.mockResolvedValue(inactiveUser);

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { status: 'inativo' },
      });
      const res = mockResponse();

      await invokeHandler(toggleUserStatus, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('inativo');
      expect(mockDeactivateUser).toHaveBeenCalledWith(TENANT_ID, 'user-uuid-1', 'admin-1');
    });

    it('should return 200 when activation succeeds', async () => {
      mockActivateUser.mockResolvedValue(sampleUserRecord);

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { status: 'ativo' },
      });
      const res = mockResponse();

      await invokeHandler(toggleUserStatus, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ativo');
      expect(mockActivateUser).toHaveBeenCalledWith(TENANT_ID, 'user-uuid-1');
    });

    it('should return 422 for self-deactivation', async () => {
      mockDeactivateUser.mockRejectedValue(
        new userService.ServiceError('Não é possível desativar o próprio usuário', 422, 'VALIDATION_ERROR'),
      );

      const req = mockRequest({
        params: { id: 'admin-1' },
        body: { status: 'inativo' },
        user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' as const },
      });
      const res = mockResponse();

      await invokeHandler(toggleUserStatus, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Não é possível desativar o próprio usuário');
    });

    it('should return 422 when user is already inactive', async () => {
      mockDeactivateUser.mockRejectedValue(
        new userService.ServiceError('Usuário já está inativo', 422, 'VALIDATION_ERROR'),
      );

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { status: 'inativo' },
      });
      const res = mockResponse();

      await invokeHandler(toggleUserStatus, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Usuário já está inativo');
    });

    it('should return 422 when user is already active', async () => {
      mockActivateUser.mockRejectedValue(
        new userService.ServiceError('Usuário já está ativo', 422, 'VALIDATION_ERROR'),
      );

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { status: 'ativo' },
      });
      const res = mockResponse();

      await invokeHandler(toggleUserStatus, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Usuário já está ativo');
    });

    it('should return 422 when deactivating last admin', async () => {
      mockDeactivateUser.mockRejectedValue(
        new userService.ServiceError('O sistema deve ter ao menos um administrador ativo', 422, 'VALIDATION_ERROR'),
      );

      const req = mockRequest({
        params: { id: 'other-admin-id' },
        body: { status: 'inativo' },
      });
      const res = mockResponse();

      await invokeHandler(toggleUserStatus, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('O sistema deve ter ao menos um administrador ativo');
    });
  });

  // ─── deleteUser ───────────────────────────────────────────────────────────

  describe('deleteUser', () => {
    it('should return 200 with success message on successful deletion', async () => {
      mockDeleteUser.mockResolvedValue(undefined);

      const req = mockRequest({ params: { id: 'user-uuid-1' } });
      const res = mockResponse();

      await invokeHandler(deleteUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Usuário excluído com sucesso' });
      expect(mockDeleteUser).toHaveBeenCalledWith(TENANT_ID, 'user-uuid-1', 'admin-1');
    });

    it('should return 422 for self-deletion', async () => {
      mockDeleteUser.mockRejectedValue(
        new userService.ServiceError('Não é permitido excluir o próprio usuário', 422, 'VALIDATION_ERROR'),
      );

      const req = mockRequest({
        params: { id: 'admin-1' },
        user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' as const },
      });
      const res = mockResponse();

      await invokeHandler(deleteUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Não é permitido excluir o próprio usuário');
    });

    it('should return 422 when user has associated orders', async () => {
      mockDeleteUser.mockRejectedValue(
        new userService.ServiceError(
          'Usuário possui pedidos associados. Desative o usuário em vez de excluí-lo',
          422,
          'VALIDATION_ERROR',
        ),
      );

      const req = mockRequest({ params: { id: 'user-uuid-1' } });
      const res = mockResponse();

      await invokeHandler(deleteUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Usuário possui pedidos associados. Desative o usuário em vez de excluí-lo');
    });

    it('should return 422 when deleting last active admin', async () => {
      mockDeleteUser.mockRejectedValue(
        new userService.ServiceError('O sistema deve ter ao menos um administrador ativo', 422, 'VALIDATION_ERROR'),
      );

      const req = mockRequest({ params: { id: 'other-admin-id' } });
      const res = mockResponse();

      await invokeHandler(deleteUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('O sistema deve ter ao menos um administrador ativo');
    });

    it('should return 404 when user does not exist', async () => {
      mockDeleteUser.mockRejectedValue(
        new userService.ServiceError('Usuário não encontrado', 404, 'NOT_FOUND'),
      );

      const req = mockRequest({ params: { id: 'nonexistent-id' } });
      const res = mockResponse();

      await invokeHandler(deleteUser, req, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Usuário não encontrado',
      });
    });
  });

  // ─── resetPassword ────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should return 200 with success message on successful reset', async () => {
      mockResetPassword.mockResolvedValue(undefined);

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { password: 'novaSenha123' },
      });
      const res = mockResponse();

      await invokeHandler(resetPassword, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ message: 'Senha redefinida com sucesso' });
      expect(mockResetPassword).toHaveBeenCalledWith(TENANT_ID, 'user-uuid-1', 'novaSenha123');
    });

    it('should return 422 when password is too short', async () => {
      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { password: 'abc' },
      });
      const res = mockResponse();

      await invokeHandler(resetPassword, req, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toContain('senha');
    });

    it('should return 404 when user does not exist', async () => {
      mockResetPassword.mockRejectedValue(
        new userService.ServiceError('Usuário não encontrado', 404, 'NOT_FOUND'),
      );

      const req = mockRequest({
        params: { id: 'nonexistent-id' },
        body: { password: 'senhaValida123' },
      });
      const res = mockResponse();

      await invokeHandler(resetPassword, req, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'Usuário não encontrado',
      });
    });

    it('should return 500 when Supabase Auth password update fails', async () => {
      mockResetPassword.mockRejectedValue(
        new userService.ServiceError('Erro ao redefinir senha', 500, 'INTERNAL_ERROR'),
      );

      const req = mockRequest({
        params: { id: 'user-uuid-1' },
        body: { password: 'senhaValida123' },
      });
      const res = mockResponse();

      await invokeHandler(resetPassword, req, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao redefinir senha',
      });
    });
  });

  // ─── listUsers ────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('should return 200 with users and total on success', async () => {
      mockListUsers.mockResolvedValue([sampleUserRecord]);

      const req = mockRequest({ query: {} });
      const res = mockResponse();

      await invokeHandler(listUsers, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.users[0].id).toBe('user-uuid-1');
    });

    it('should pass role and status filters to the service', async () => {
      mockListUsers.mockResolvedValue([]);

      const req = mockRequest({ query: { role: 'admin', status: 'ativo' } });
      const res = mockResponse();

      await invokeHandler(listUsers, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(mockListUsers).toHaveBeenCalledWith(TENANT_ID, { role: 'admin', status: 'ativo' });
      expect(res.body.users).toHaveLength(0);
      expect(res.body.total).toBe(0);
    });

    it('should return empty list when no users match filters', async () => {
      mockListUsers.mockResolvedValue([]);

      const req = mockRequest({ query: { role: 'preparador' } });
      const res = mockResponse();

      await invokeHandler(listUsers, req, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ users: [], total: 0 });
    });
  });

  // ─── Error response format ────────────────────────────────────────────────

  describe('Error response format', () => {
    it('should return standardized error format with statusCode, error, and message', async () => {
      mockGetUserById.mockRejectedValue(
        new userService.ServiceError('Erro genérico', 500, 'INTERNAL_ERROR'),
      );

      const req = mockRequest({ params: { id: 'user-uuid-1' } });
      const res = mockResponse();

      await invokeHandler(getUserById, req, res as unknown as Response);

      expect(res.body).toHaveProperty('statusCode', 500);
      expect(res.body).toHaveProperty('error', 'INTERNAL_ERROR');
      expect(res.body).toHaveProperty('message', 'Erro genérico');
    });

    it('should return 500 with fallback message for unexpected errors', async () => {
      mockGetUserById.mockRejectedValue(new Error('Unexpected crash'));

      const req = mockRequest({ params: { id: 'user-uuid-1' } });
      const res = mockResponse();

      await invokeHandler(getUserById, req, res as unknown as Response);

      // Após a migração para o error middleware, erros inesperados (não
      // ServiceError) recebem uma mensagem genérica única — não mais um
      // fallback por-endpoint. O contrato de status/código permanece.
      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({
        statusCode: 500,
        error: 'INTERNAL_ERROR',
        message: 'Erro ao processar requisição',
      });
    });
  });
});
