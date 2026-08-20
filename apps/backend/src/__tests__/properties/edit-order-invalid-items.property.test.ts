import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

/**
 * Feature: edit-order, Property 4: Invalid Menu Items Cause Atomic Rejection
 *
 * For any order in `aguardando` status and for any items list containing at least
 * one menuItemId that either does not exist in the menu_items table or references
 * an inactive item, the update request SHALL be rejected with HTTP 422, and the
 * order's existing items and total SHALL remain completely unchanged.
 *
 * **Validates: Requirements 1.4, 5.4**
 */

// Mock supabaseAdmin
const mockChannel = vi.fn();
const mockSend = vi.fn();

vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    channel: (...args: any[]) => mockChannel(...args),
  },
}));

// Mock pg Pool
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();
const mockPoolQuery = vi.fn();

vi.mock('../../config/database.js', () => ({
  pool: {
    connect: () => mockConnect(),
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}));

// Mock date-fns-tz
vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2024-06-15T10:00:00')),
  format: vi.fn().mockReturnValue('2024-06-15'),
}));

import { updateOrderItems } from '../../controllers/order.controller.js';

function mockRequest(body: any, params: any): Partial<AuthenticatedRequest> {
  return {
    body,
    params,
    user: { id: 'user-1', email: 'test@test.com' },
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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

describe('Property 4: Invalid Menu Items Cause Atomic Rejection', () => {
  const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  const mockOrder = {
    id: orderId,
    daily_number: 5,
    customer_name: 'João Silva',
    origin: 'presencial',
    status: 'aguardando',
    payment_status: 'pendente',
    payment_method: null,
    total_amount_cents: 1000,
    order_date: '2024-06-15',
    created_at: '2024-06-15T13:00:00.000Z',
    started_at: null,
    ready_at: null,
    delivered_at: null,
    paid_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });

    mockChannel.mockReturnValue({
      send: mockSend.mockResolvedValue(undefined),
    });
  });

  // Generators
  const validUuid = fc.uuid();
  const validQuantity = fc.integer({ min: 1, max: 99 });

  /**
   * Generates test data for non-existent menu item scenario:
   * - A list of 2+ unique items where the last item does not exist in the DB
   */
  const nonExistentMenuItemData = fc
    .tuple(
      fc.array(
        fc.record({ menuItemId: validUuid, quantity: validQuantity }),
        { minLength: 1, maxLength: 5 }
      ),
      validUuid,
      validQuantity
    )
    .chain(([validItems, extraId, extraQty]) => {
      // Deduplicate
      const seen = new Set<string>();
      const deduped = validItems.filter((item) => {
        if (seen.has(item.menuItemId)) return false;
        seen.add(item.menuItemId);
        return true;
      });
      // Add the non-existent item (ensure unique)
      if (!seen.has(extraId)) {
        deduped.push({ menuItemId: extraId, quantity: extraQty });
      }
      if (deduped.length < 2) {
        return fc.constant(null);
      }
      return fc.constant({
        items: deduped,
        // Simulate that the DB only returns items for all except the last one
        dbMenuItems: deduped.slice(0, -1).map((item) => ({
          id: item.menuItemId,
          name: 'Item ' + item.menuItemId.substring(0, 8),
          price_cents: 500,
          status: 'ativo',
        })),
      });
    })
    .filter((data): data is NonNullable<typeof data> => data !== null);

  /**
   * Generates test data for inactive menu item scenario:
   * - A list of 2+ unique items where the last item is inactive in the DB
   */
  const inactiveMenuItemData = fc
    .tuple(
      fc.array(
        fc.record({ menuItemId: validUuid, quantity: validQuantity }),
        { minLength: 1, maxLength: 5 }
      ),
      validUuid,
      validQuantity
    )
    .chain(([validItems, inactiveId, inactiveQty]) => {
      const seen = new Set<string>();
      const deduped = validItems.filter((item) => {
        if (seen.has(item.menuItemId)) return false;
        seen.add(item.menuItemId);
        return true;
      });
      if (!seen.has(inactiveId)) {
        deduped.push({ menuItemId: inactiveId, quantity: inactiveQty });
      }
      if (deduped.length < 2) {
        return fc.constant(null);
      }
      const inactiveItemId = deduped[deduped.length - 1]!.menuItemId;
      return fc.constant({
        items: deduped,
        // DB returns all items, but the last one has status 'inativo'
        dbMenuItems: deduped.map((item) => ({
          id: item.menuItemId,
          name: 'Item ' + item.menuItemId.substring(0, 8),
          price_cents: 500,
          status: item.menuItemId === inactiveItemId ? 'inativo' : 'ativo',
        })),
      });
    })
    .filter((data): data is NonNullable<typeof data> => data !== null);

  it('rejects with 422 when items reference non-existent menu items (no transaction started)', async () => {
    await fc.assert(
      fc.asyncProperty(nonExistentMenuItemData, async (data) => {
        // Reset mocks for each iteration
        mockPoolQuery.mockReset();
        mockConnect.mockReset();
        mockClientQuery.mockReset();
        mockChannel.mockReset();
        mockSend.mockReset();

        mockConnect.mockResolvedValue({
          query: mockClientQuery,
          release: mockRelease,
        });

        // 1st pool.query call: order lookup
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder }] });
        // 2nd pool.query call: menu item lookup (missing the last one)
        mockPoolQuery.mockResolvedValueOnce({ rows: data.dbMenuItems });

        const req = mockRequest({ items: data.items }, { id: orderId });
        const res = mockResponse();

        await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

        // Should reject with 422
        expect(res.statusCode).toBe(422);
        expect(res.body.error).toBe('VALIDATION_ERROR');
        expect(res.body.message).toBe('Item não encontrado ou inativo');

        // No transaction should have been started
        expect(mockConnect).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('rejects with 422 when items reference inactive menu items (no transaction started)', async () => {
    await fc.assert(
      fc.asyncProperty(inactiveMenuItemData, async (data) => {
        // Reset mocks for each iteration
        mockPoolQuery.mockReset();
        mockConnect.mockReset();
        mockClientQuery.mockReset();
        mockChannel.mockReset();
        mockSend.mockReset();

        mockConnect.mockResolvedValue({
          query: mockClientQuery,
          release: mockRelease,
        });

        // 1st pool.query call: order lookup
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...mockOrder }] });
        // 2nd pool.query call: menu item lookup (last one is inactive)
        mockPoolQuery.mockResolvedValueOnce({ rows: data.dbMenuItems });

        const req = mockRequest({ items: data.items }, { id: orderId });
        const res = mockResponse();

        await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

        // Should reject with 422
        expect(res.statusCode).toBe(422);
        expect(res.body.error).toBe('VALIDATION_ERROR');
        expect(res.body.message).toBe('Item não encontrado ou inativo');

        // No transaction should have been started
        expect(mockConnect).not.toHaveBeenCalled();
      }),
      { numRuns: 100 }
    );
  });

  it('order data remains unchanged when request is rejected due to invalid menu items', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonExistentMenuItemData,
        fc.integer({ min: 100, max: 100000 }),
        async (data, originalTotal) => {
          // Reset mocks for each iteration
          mockPoolQuery.mockReset();
          mockConnect.mockReset();
          mockClientQuery.mockReset();
          mockChannel.mockReset();
          mockSend.mockReset();

          mockConnect.mockResolvedValue({
            query: mockClientQuery,
            release: mockRelease,
          });

          const orderWithTotal = { ...mockOrder, total_amount_cents: originalTotal };

          // 1st pool.query call: order lookup
          mockPoolQuery.mockResolvedValueOnce({ rows: [orderWithTotal] });
          // 2nd pool.query call: menu item lookup (non-existent)
          mockPoolQuery.mockResolvedValueOnce({ rows: data.dbMenuItems });

          const req = mockRequest({ items: data.items }, { id: orderId });
          const res = mockResponse();

          await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

          // Request is rejected
          expect(res.statusCode).toBe(422);

          // No transaction queries should be executed
          expect(mockConnect).not.toHaveBeenCalled();
          expect(mockClientQuery).not.toHaveBeenCalled();

          // No broadcast event sent
          expect(mockChannel).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
