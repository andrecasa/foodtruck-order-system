import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { pool } from '../../config/database.js';
import {
  listCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  toggleCategoryStatus,
  deleteCategory,
} from '../../controllers/category.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(body?: any, params?: any): Partial<AuthenticatedRequest> {
  return {
    body: body || {},
    params: params || {},
    user: { id: 'user-1', email: 'admin@test.com' },
    // Tenant resolved by tenantMiddleware; required by tenant-scoped services.
    tenantId: 'tenant-1',
  } as Partial<AuthenticatedRequest>;
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

describe('Category Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/categories (listCategories)', () => {
    it('should return categories with item counts', async () => {
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-1',
            name: 'Bebidas',
            sort_order: 0,
            status: 'ativo',
            created_at: '2024-01-01T00:00:00Z',
            item_count: 3,
          },
          {
            id: 'cat-2',
            name: 'Pastéis Salgados',
            sort_order: 1,
            status: 'ativo',
            created_at: '2024-01-02T00:00:00Z',
            item_count: 5,
          },
        ],
      } as any);

      const req = mockRequest();
      const res = mockResponse();

      await invokeHandler(listCategories, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0]).toEqual({
        id: 'cat-1',
        name: 'Bebidas',
        sortOrder: 0,
        status: 'ativo',
        itemCount: 3,
        createdAt: '2024-01-01T00:00:00Z',
      });
      expect(res.body[1]).toEqual({
        id: 'cat-2',
        name: 'Pastéis Salgados',
        sortOrder: 1,
        status: 'ativo',
        itemCount: 5,
        createdAt: '2024-01-02T00:00:00Z',
      });
    });
  });

  describe('POST /api/categories (createCategory)', () => {
    it('should create category with valid name and return 201', async () => {
      // Uniqueness check - no duplicates
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);
      // Max sort_order
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ max_sort_order: 2 }],
      } as any);
      // Insert
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'new-cat-1',
            name: 'Nova Categoria',
            sort_order: 3,
            status: 'ativo',
            created_at: '2024-01-10T00:00:00Z',
          },
        ],
      } as any);

      const req = mockRequest({ name: 'Nova Categoria' });
      const res = mockResponse();

      await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual({
        id: 'new-cat-1',
        name: 'Nova Categoria',
        sortOrder: 3,
        status: 'ativo',
        createdAt: '2024-01-10T00:00:00Z',
      });
    });

    it('should return 409 when name already exists (duplicate)', async () => {
      // Uniqueness check - found duplicate
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: 'existing-cat' }],
      } as any);

      const req = mockRequest({ name: 'Bebidas' });
      const res = mockResponse();

      await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toBe('CONFLICT');
      expect(res.body.message).toBe('Já existe uma categoria com este nome');
    });

    it('should return 422 when name is missing', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      await invokeHandler(createCategory, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Nome é obrigatório');
    });
  });

  describe('PUT /api/categories/:id (updateCategory)', () => {
    it('should return 404 when category does not exist', async () => {
      // Existence check - not found
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({ name: 'Novo Nome' }, { id: '550e8400-e29b-41d4-a716-446655440099' });
      const res = mockResponse();

      await invokeHandler(updateCategory, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Categoria não encontrada');
    });
  });

  describe('PUT /api/categories/reorder (reorderCategories)', () => {
    it('should return 422 when list is empty', async () => {
      const req = mockRequest({ categoryIds: [] });
      const res = mockResponse();

      await invokeHandler(reorderCategories, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Lista de categorias não pode estar vazia');
    });
  });

  describe('PATCH /api/categories/:id/status (toggleCategoryStatus)', () => {
    it('should return 422 when deactivating category with active items', async () => {
      // Category exists and is active
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-1',
            name: 'Pastéis',
            sort_order: 0,
            status: 'ativo',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      } as any);
      // Active items count > 0
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ count: 3 }],
      } as any);

      const req = mockRequest({ action: 'deactivate' }, { id: 'cat-1' });
      const res = mockResponse();

      await invokeHandler(toggleCategoryStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe(
        'Categoria possui itens ativos. Desative os itens antes de desativar a categoria'
      );
    });

    it('should return 422 when deactivating an already inactive category', async () => {
      // Category exists and is already inactive
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-1',
            name: 'Pastéis',
            sort_order: 0,
            status: 'inativo',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
      } as any);

      const req = mockRequest({ action: 'deactivate' }, { id: 'cat-1' });
      const res = mockResponse();

      await invokeHandler(toggleCategoryStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe('Categoria já está inativa');
    });
  });

  describe('DELETE /api/categories/:id (deleteCategory)', () => {
    it('should return 422 when category has associated items', async () => {
      // Category exists
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ id: 'cat-1' }],
      } as any);
      // Items count > 0
      vi.mocked(pool.query).mockResolvedValueOnce({
        rows: [{ count: 2 }],
      } as any);

      const req = mockRequest({}, { id: 'cat-1' });
      const res = mockResponse();

      await invokeHandler(deleteCategory, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
      expect(res.body.message).toBe(
        'Categoria possui itens associados. Mova ou exclua os itens antes de excluir a categoria'
      );
    });

    it('should return 404 when category does not exist', async () => {
      // Category not found
      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);

      const req = mockRequest({}, { id: '550e8400-e29b-41d4-a716-446655440099' });
      const res = mockResponse();

      await invokeHandler(deleteCategory, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
      expect(res.body.message).toBe('Categoria não encontrada');
    });
  });
});
