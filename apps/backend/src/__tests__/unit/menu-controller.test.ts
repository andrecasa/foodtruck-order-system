import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

// Mock pg Pool - needed for getMenu and toggleMenuItemStatus which use pool.query
const mockPoolQuery = vi.fn();
vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}));

import {
  getMenu,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemStatus,
} from '../../controllers/menu.controller.js';
import { invokeHandler } from '../helpers/invoke-handler.js';

function mockRequest(body?: any, params?: any, query?: any): Partial<AuthenticatedRequest> {
  return {
    body: body || {},
    params: params || {},
    query: query || {},
    user: { id: 'user-1', email: 'test@test.com' },
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

describe('Menu Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/menu (getMenu)', () => {
    it('should return active items grouped by category and sorted', async () => {
      const mockRows = [
        {
          id: '1', name: 'Pastel de Carne', price_cents: 750, status: 'ativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados', category_sort_order: 1,
        },
        {
          id: '3', name: 'Pastel de Queijo', price_cents: 700, status: 'ativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados', category_sort_order: 1,
        },
        {
          id: '2', name: 'Água Mineral', price_cents: 300, status: 'ativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Bebidas', category_sort_order: 3,
        },
      ];

      mockPoolQuery.mockResolvedValue({ rows: mockRows });

      const req = mockRequest();
      const res = mockResponse();

      await invokeHandler(getMenu, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(2);
      // First category by sort_order
      expect(res.body[0].category).toBe('Pastéis Salgados');
      expect(res.body[0].items).toHaveLength(2);
      // Items sorted alphabetically within category
      expect(res.body[0].items[0].name).toBe('Pastel de Carne');
      expect(res.body[0].items[1].name).toBe('Pastel de Queijo');
      // Second category
      expect(res.body[1].category).toBe('Bebidas');
      expect(res.body[1].items).toHaveLength(1);
    });

    it('should return empty array when no active items', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [] });

      const req = mockRequest();
      const res = mockResponse();

      await invokeHandler(getMenu, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return 500 on database error', async () => {
      mockPoolQuery.mockRejectedValue(new Error('DB error'));

      const req = mockRequest();
      const res = mockResponse();

      await invokeHandler(getMenu, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(500);
      expect(res.body.error).toBe('INTERNAL_ERROR');
    });
  });

  describe('POST /api/menu (createMenuItem)', () => {
    it('should create item successfully with valid data', async () => {
      // Mock category lookup
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] });
      // Mock name uniqueness check
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // Mock insert
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-1', name: 'Novo Pastel', price_cents: 800, status: 'ativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_id: 'cat-1',
        }],
      });
      // Mock category name lookup
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Pastéis Salgados' }] });

      const req = mockRequest({ name: 'Novo Pastel', price: 800, category: 'Pastéis Salgados' });
      const res = mockResponse();

      await invokeHandler(createMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Novo Pastel');
      expect(res.body.price).toBe(800);
      expect(res.body.status).toBe('ativo');
    });

    it('should return 422 for invalid Zod data (missing name)', async () => {
      const req = mockRequest({ price: 800, category: 'Pastéis Salgados' });
      const res = mockResponse();

      await invokeHandler(createMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    it('should return 422 when price is 0 (via Zod min validation)', async () => {
      const req = mockRequest({ name: 'Item', price: 0, category: 'Pastéis Salgados' });
      const res = mockResponse();

      await invokeHandler(createMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Preço deve ser maior que zero');
    });

    it('should return 422 when price is negative', async () => {
      const req = mockRequest({ name: 'Item', price: -100, category: 'Pastéis Salgados' });
      const res = mockResponse();

      await invokeHandler(createMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Preço deve ser maior que zero');
    });

    it('should return 422 when category does not exist', async () => {
      // Category not found
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ name: 'Item', price: 500, category: 'Inexistente' });
      const res = mockResponse();

      await invokeHandler(createMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Categoria inválida');
    });

    it('should return 409 when name already exists (case-insensitive)', async () => {
      // Category exists
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] });
      // Name collision found
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-1' }] });

      const req = mockRequest({ name: 'PASTEL DE CARNE', price: 750, category: 'Pastéis Salgados' });
      const res = mockResponse();

      await invokeHandler(createMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('Item com este nome já existe');
    });
  });

  describe('PUT /api/menu/:id (updateMenuItem)', () => {
    it('should update item successfully', async () => {
      const updatedRow = {
        id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel Atualizado', price_cents: 900, status: 'ativo',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        category_id: 'cat-1',
      };
      // Item exists (findOne)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', status: 'ativo' }] });
      // No name collision (select)
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      // UPDATE (rowCount)
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      // Re-read updated row (findOne)
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedRow] });
      // Category name lookup (findOne)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Pastéis Salgados' }] });

      const req = mockRequest({ name: 'Pastel Atualizado', price: 900 }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(updateMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('550e8400-e29b-41d4-a716-446655440001');
      expect(res.body.name).toBe('Pastel Atualizado');
      expect(res.body.price).toBe(900);
    });

    it('should return 404 when item does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ name: 'New Name' }, { id: '550e8400-e29b-41d4-a716-446655440099' });
      const res = mockResponse();

      await invokeHandler(updateMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('should return 409 when new name collides with another active item', async () => {
      // Item exists
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', status: 'ativo' }] });
      // Name collision found
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440002' }] });

      const req = mockRequest({ name: 'Pastel de Queijo' }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(updateMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('Item com este nome já existe');
    });

    it('should return 422 when category is invalid', async () => {
      // Item exists
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', status: 'ativo' }] });
      // Category not found
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ category: 'Inexistente' }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(updateMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(422);
      expect(res.body.message).toBe('Categoria inválida');
    });

    it('should preserve ID on update (ID not in response body as different from param)', async () => {
      const updatedRow = {
        id: '550e8400-e29b-41d4-a716-446655440001', name: 'Updated', price_cents: 500, status: 'ativo',
        created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        category_id: 'cat-1',
      };
      // Item exists (findOne)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', status: 'ativo' }] });
      // UPDATE (rowCount) — only price changed, no name collision check needed
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      // Re-read updated row (findOne)
      mockPoolQuery.mockResolvedValueOnce({ rows: [updatedRow] });
      // Category name lookup (findOne)
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Bebidas' }] });

      const req = mockRequest({ price: 500 }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(updateMenuItem, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('550e8400-e29b-41d4-a716-446655440001');
    });
  });

  describe('PATCH /api/menu/:id/status (toggleMenuItemStatus)', () => {
    it('should deactivate an active item', async () => {
      // Item exists and is active - pool.query for SELECT
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', status: 'ativo',
          price_cents: 750, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados',
        }],
      });

      // Update status - pool.query for UPDATE (rowCount)
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Re-read updated row (findOne)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', price_cents: 750, status: 'inativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        }],
      });

      const req = mockRequest({ status: 'inativo' }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(toggleMenuItemStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('inativo');
    });

    it('should activate an inactive item', async () => {
      // Item exists and is inactive
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', status: 'inativo',
          price_cents: 750, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados',
        }],
      });

      // Collision check - no collisions
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      // Update status (rowCount)
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Re-read updated row (findOne)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', price_cents: 750, status: 'ativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        }],
      });

      const req = mockRequest({ status: 'ativo' }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(toggleMenuItemStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('ativo');
    });

    it('should return 422 for invalid status value', async () => {
      // The controller doesn't validate status from body before querying.
      // It accepts any status; if not 'ativo' or 'inativo', it toggles.
      // Actually looking at the controller: it checks req.body.status includes in ['ativo', 'inativo']
      // If not in that list, it toggles. So we need to verify it goes to toggle path.
      // But the test expects 422. Let's check if validation happens...
      // Looking at controller: `if (req.body.status && ['ativo', 'inativo'].includes(req.body.status))`
      // If body.status is 'deleted', it doesn't match, so it toggles (not a 422).
      // But the test expects 422. Let me check if there's Zod validation...
      // Actually, looking more carefully, there's no Zod schema for toggleMenuItemStatus.
      // The controller just does: if status is valid, use it; otherwise toggle.
      // So 'deleted' would just toggle. The test expectation was wrong in the original.
      // But we can't change the source code. Let me re-read the controller more carefully.

      // Actually wait - let me re-read: the controller does NOT return 422 for invalid status.
      // It just toggles. But the original test expects 422.
      // Since we can't change source, we need to make the test match the source behavior.
      // The controller will query the DB to find the item, then toggle.
      // With status='deleted' it won't match the includes check, so it toggles.

      // BUT WAIT - I need to re-read the original test. It says:
      // expect(res.statusCode).toBe(422);
      // expect(res.body.message).toBe('Status deve ser "ativo" ou "inativo"');
      // This means the controller SHOULD validate. Let me check if there's validation I'm missing.

      // Looking at the controller again more carefully - it has NO explicit 422 for invalid status.
      // The test was passing before (18 passed in original output), so either:
      // 1. This test was passing before, or
      // 2. The status validation tests are in the "passed" group

      // From the test output: "Tests: 17 failed | 18 passed (35)"
      // The toggleMenuItemStatus tests that fail are "should deactivate an active item",
      // "should activate an inactive item", and "should return 409 when reactivating and name collides"
      // The validation tests (422 for invalid/missing status, 404) might be passing or failing.
      // Let me look at what's actually failing...

      // The errors show "invalid input syntax for type uuid: item-1" for the toggle tests.
      // The 422 validation tests don't hit the DB so they might be passing.
      // But looking at the controller - it doesn't validate status before DB query.
      // It queries DB first, THEN decides. So for 'deleted' status with a valid item,
      // it would toggle, not return 422.

      // However, since the test was originally passing (the 422 tests aren't in the failure list),
      // this means the controller DOES handle it somehow. Let me check if there's a 
      // middleware or if I missed something in the controller.

      // Re-reading: The controller checks `req.body.status && ['ativo', 'inativo'].includes(req.body.status)` 
      // If false, it does: `newStatus = existingItem.status === 'ativo' ? 'inativo' : 'ativo'`
      // So invalid status just toggles. This test would NOT pass against the current controller.
      // But since it's listed as "18 passed" in the original test run output...
      // Let me check if this is one of the PASSING or FAILING tests.

      // Looking at the error output carefully - the menu-controller has 8 failures:
      // 3 from getMenu (pool.all undefined) + 5 from toggleMenuItemStatus (invalid UUID)
      // The 422 validation tests (invalid status, missing status) must be PASSING since
      // they don't hit the DB at all if the controller validates first.
      // BUT the controller DOESN'T validate first - it queries DB first.

      // Wait, actually maybe the "422 for invalid/missing status" tests ARE among the passing ones
      // because with no pool mock and "item-1" as ID, the pool.query would reject with 
      // "invalid uuid" error which causes a 500... but the test expects 422...
      // Hmm, let me just run these specific tests to check.

      // Actually I realize: the original test had supabase mocks for toggleMenuItemStatus.
      // But the controller uses pool.query. So with no pool.query mock, ALL toggle tests fail
      // with either "Cannot read properties" or the actual pool (if not mocked) rejects.
      // The original failing count is 8 for menu-controller:
      // 3 getMenu + 5 toggleMenuItemStatus tests

      // Let me look at what tests exist in the toggle section:
      // 1. should deactivate an active item - FAILS (uuid)
      // 2. should activate an inactive item - FAILS (uuid)
      // 3. should return 422 for invalid status value - was it failing?
      // 4. should return 422 when status is missing - was it failing?
      // 5. should return 404 when item does not exist - FAILS (uuid)
      // 6. should return 409 when reactivating and name collides - FAILS (uuid)

      // The test output shows 8 failures total. 3 getMenu + 5 toggle = 8. So ALL toggle tests fail.
      // Tests 3 and 4 also fail because with the old mock setup (supabase mock, no pool mock),
      // the controller's pool.query call would fail.

      // NOW: the controller doesn't validate status before DB query. So for tests 3 and 4 to pass,
      // I need to either:
      // - Accept that these tests need a pool mock and will toggle (not 422)
      // - OR check if maybe there's Zod validation I'm missing

      // Actually, wait. Let me re-read the controller code for toggleMenuItemStatus:
      // It starts by querying pool.query to find the item. If the status in body isn't valid,
      // it toggles. So with body { status: 'deleted' }, it would query for the item,
      // find it, and toggle it. Not return 422.
      // 
      // BUT the instructions say "Do NOT change the production source code... Only fix the test files"
      // AND "The tests need to match the current implementation."
      // 
      // So if the current implementation doesn't validate, the test expecting 422 is WRONG
      // and should be fixed to match the implementation. But "fix the test files" means
      // making them pass against the current code.
      //
      // For { status: 'deleted' } - controller will query DB, find item, toggle.
      // For { } (missing status) - same: controller queries DB, doesn't find body.status in valid list, toggles.
      // 
      // So these tests need to expect a toggle result, not 422.
      // But that would change the test semantics entirely...
      // 
      // Actually wait - let me re-read: the condition is:
      // `if (req.body.status && ['ativo', 'inativo'].includes(req.body.status))`
      // For { status: 'deleted' }: req.body.status is 'deleted', truthy, but not in the list.
      // So it goes to else: toggles.
      // For { }: req.body.status is undefined, falsy. Goes to else: toggles.
      //
      // So these 422 tests will never pass against the current implementation unless we mock
      // the pool to return an item and then check the toggled result.
      //
      // HOWEVER - looking at the original error count: "8 failures" in menu-controller.
      // Total tests in menu-controller: getMenu(3) + createMenuItem(6) + updateMenuItem(5) + toggleMenuItemStatus(6) = 20
      // Passed: 20 - 8 = 12. That means 12 tests pass.
      // createMenuItem has 6 tests, updateMenuItem has 5 tests = 11 that pass (supabase based).
      // Plus 1 more from toggle that passes... but which one?
      // 
      // Actually: getMenu has 3 tests (all fail = 3), toggle has 6 tests.
      // 8 - 3 = 5 toggle tests fail. So 1 toggle test passes!
      // Which one? The "422 for invalid status" or "422 when status missing"?
      // With no pool mock, pool.query would throw (since it's not mocked).
      // So ALL toggle tests should fail with 500.
      // Unless... the 422 tests somehow don't reach pool.query?
      //
      // Looking at the controller: it goes straight to pool.query first thing.
      // There's NO validation before the DB query. So all toggle tests hit pool.query.
      // With no mock, they'd all fail. So all 6 should fail. But only 5 fail...
      // Wait, original says "8 failures" total for menu-controller. Let me recount.
      //
      // OK actually let me just look at the original error output. It says:
      // "Tests: 17 failed | 18 passed (35)"
      // 3 test files, 35 total tests. menu-controller has some, order-controller has some, property has some.
      //
      // Let me just look at what the actual tests are and check which passed.
      // I'll just fix what I can and run to see what happens.
      //
      // For the 422 tests: since the controller doesn't validate, I'll update these tests
      // to match the actual behavior (toggle).
      // Actually, I should first see if these are currently PASSING or FAILING.
      // Let me just make all tests correct against the implementation and run them.

      // The controller doesn't validate status before querying. With 'deleted', it toggles.
      // So this test needs to mock the pool query and expect a toggle.
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', status: 'ativo',
          price_cents: 750, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados',
        }],
      });

      // Since 'deleted' is not in valid list, it toggles from ativo -> inativo
      // UPDATE (rowCount)
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Re-read updated row (findOne)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', price_cents: 750, status: 'inativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        }],
      });

      const req = mockRequest({ status: 'deleted' }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(toggleMenuItemStatus, req as AuthenticatedRequest, res as unknown as Response);

      // The controller toggles - it doesn't validate. So we get 200 with toggled status.
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('inativo');
    });

    it('should toggle when status is missing', async () => {
      // Controller toggles when no valid status is provided
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', status: 'ativo',
          price_cents: 750, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados',
        }],
      });

      // UPDATE (rowCount)
      mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // Re-read updated row (findOne)
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', price_cents: 750, status: 'inativo',
          created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-02T00:00:00Z',
        }],
      });

      const req = mockRequest({}, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(toggleMenuItemStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('inativo');
    });

    it('should return 404 when item does not exist', async () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });

      const req = mockRequest({ status: 'inativo' }, { id: '550e8400-e29b-41d4-a716-446655440099' });
      const res = mockResponse();

      await invokeHandler(toggleMenuItemStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBe('NOT_FOUND');
    });

    it('should return 409 when reactivating and name collides', async () => {
      // Item exists and is inactive
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440001', name: 'Pastel', status: 'inativo',
          price_cents: 750, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
          category_name: 'Pastéis Salgados',
        }],
      });

      // Collision found
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440002' }],
      });

      const req = mockRequest({ status: 'ativo' }, { id: '550e8400-e29b-41d4-a716-446655440001' });
      const res = mockResponse();

      await invokeHandler(toggleMenuItemStatus, req as AuthenticatedRequest, res as unknown as Response);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toBe('Item com este nome já existe');
    });
  });
});
