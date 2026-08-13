import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response, NextFunction } from 'express';

// Mock the database module
const mockQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

import { adminMiddleware, AdminRequest } from '../../middleware/role.middleware.js';

function mockRequest(user?: { id: string; email: string }): Partial<AdminRequest> {
  return {
    user: user as any,
  };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
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

describe('Role Middleware - adminMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call next() and enrich req.user with role when user is admin', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ role: 'admin', status: 'ativo' }],
    });

    const req = mockRequest({ id: 'user-1', email: 'admin@test.com' });
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user).toEqual({
      id: 'user-1',
      email: 'admin@test.com',
      role: 'admin',
    });
    expect(mockQuery).toHaveBeenCalledWith(
      'SELECT role, status FROM users WHERE id = $1',
      ['user-1'],
    );
  });

  it('should return 403 when user has role atendente', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ role: 'atendente', status: 'ativo' }],
    });

    const req = mockRequest({ id: 'user-2', email: 'atendente@test.com' });
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toBe('Acesso restrito a administradores.');
  });

  it('should return 403 when user has role preparador', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ role: 'preparador', status: 'ativo' }],
    });

    const req = mockRequest({ id: 'user-3', email: 'preparador@test.com' });
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toBe('Acesso restrito a administradores.');
  });

  it('should return 401 when user is not found in database', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const req = mockRequest({ id: 'non-existent', email: 'ghost@test.com' });
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    expect(res.body.message).toBe('Sessão inválida. Faça login novamente.');
  });

  it('should return 403 when user is inactive', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ role: 'admin', status: 'inativo' }],
    });

    const req = mockRequest({ id: 'user-4', email: 'inactive@test.com' });
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
    expect(res.body.message).toBe('Usuário desativado. Contate o administrador.');
  });

  it('should return 401 when req.user is undefined', async () => {
    const req = mockRequest(undefined);
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    expect(res.body.message).toBe('Sessão inválida. Faça login novamente.');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should return 500 when database throws an error', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

    const req = mockRequest({ id: 'user-5', email: 'error@test.com' });
    const res = mockResponse();
    let nextCalled = false;

    await adminMiddleware(req as AdminRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Erro interno ao verificar permissões.');
  });
});
