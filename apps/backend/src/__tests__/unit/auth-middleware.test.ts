import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { Request, Response } from 'express';

// Mock the supabase module
vi.mock('../../config/supabase.js', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
  },
}));

import { supabase } from '../../config/supabase.js';

function mockRequest(authHeader?: string): Partial<AuthenticatedRequest> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
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

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no authorization header is present', async () => {
    const req = mockRequest();
    const res = mockResponse();
    let nextCalled = false;

    await authMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Token de autenticação não fornecido');
  });

  it('should return 401 when authorization header does not start with Bearer', async () => {
    const req = mockRequest('Basic abc123');
    const res = mockResponse();
    let nextCalled = false;

    await authMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('should return 401 when token is invalid', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token', name: 'AuthError', status: 401 },
    } as any);

    const req = mockRequest('Bearer invalid-token');
    const res = mockResponse();
    let nextCalled = false;

    await authMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('UNAUTHORIZED');
    expect(res.body.message).toContain('Token inválido ou expirado');
  });

  it('should call next and set req.user when token is valid', async () => {
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      },
      error: null,
    } as any);

    const req = mockRequest('Bearer valid-token');
    const res = mockResponse();
    let nextCalled = false;

    await authMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect((req as AuthenticatedRequest).user).toEqual({
      id: 'user-123',
      email: 'test@example.com',
    });
  });

  it('should return 401 when supabase throws an exception', async () => {
    vi.mocked(supabase.auth.getUser).mockRejectedValue(new Error('Network error'));

    const req = mockRequest('Bearer some-token');
    const res = mockResponse();
    let nextCalled = false;

    await authMiddleware(req as AuthenticatedRequest, res as unknown as Response, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toContain('Falha na verificação do token');
  });
});
