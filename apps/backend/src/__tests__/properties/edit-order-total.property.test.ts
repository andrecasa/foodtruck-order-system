import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

/**
 * Feature: edit-order, Property 1: Total Calculation Invariant
 *
 * For any valid set of items with known prices and quantities, the returned
 * totalAmountCents equals Σ(price_cents × quantity) and each item's unitPriceCents
 * matches the menu item's current price.
 *
 * **Validates: Requirements 1.1, 5.2**
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

describe('Property 1: Total Calculation Invariant', () => {
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
  });

  // Generator: a menu item with a random price (1–999999 cents)
  const menuItemArb = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    price_cents: fc.integer({ min: 1, max: 999999 }),
    status: fc.constant('ativo' as const),
  });

  // Generator: 1–10 unique menu items (unique by id)
  const menuItemsArb = fc
    .array(menuItemArb, { minLength: 1, maxLength: 10 })
    .map((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
    })
    .filter((items) => items.length >= 1);

  // Generator: order items with quantities, derived from menu items
  const orderInputArb = menuItemsArb.chain((menuItems) =>
    fc
      .array(
        fc.record({
          index: fc.integer({ min: 0, max: menuItems.length - 1 }),
          quantity: fc.integer({ min: 1, max: 99 }),
        }),
        { minLength: 1, maxLength: menuItems.length }
      )
      .map((selections) => {
        // Ensure unique menu items in the request (no duplicate menuItemIds)
        const usedIndices = new Set<number>();
        const items = selections.filter((s) => {
          if (usedIndices.has(s.index)) return false;
          usedIndices.add(s.index);
          return true;
        });
        return {
          menuItems,
          requestItems: items.map((s) => ({
            menuItemId: menuItems[s.index]!.id,
            quantity: s.quantity,
          })),
        };
      })
      .filter((input) => input.requestItems.length >= 1)
  );

  it('totalAmountCents equals Σ(price_cents × quantity) and each unitPriceCents matches menu price', async () => {
    await fc.assert(
      fc.asyncProperty(orderInputArb, async ({ menuItems, requestItems }) => {
        vi.clearAllMocks();

        // Setup pool.connect to return a client for the transaction
        mockConnect.mockResolvedValue({
          query: mockClientQuery,
          release: mockRelease,
        });

        // Setup realtime channel
        mockChannel.mockReturnValue({
          send: mockSend.mockResolvedValue(undefined),
        });

        // Setup pool.query calls:
        // 1st call: order lookup by ID
        // 2nd call: menu items lookup
        let poolQueryCallCount = 0;
        mockPoolQuery.mockImplementation(async () => {
          poolQueryCallCount++;
          if (poolQueryCallCount === 1) {
            // Order lookup
            return { rows: [mockOrder] };
          }
          if (poolQueryCallCount === 2) {
            // Menu items lookup
            return { rows: menuItems };
          }
          return { rows: [] };
        });

        // Setup transaction client.query calls:
        // BEGIN → DELETE → INSERT items... → UPDATE total → COMMIT
        let clientQueryCallCount = 0;
        mockClientQuery.mockImplementation(async () => {
          clientQueryCallCount++;
          // 1: BEGIN
          if (clientQueryCallCount === 1) return undefined;
          // 2: DELETE old order_items
          if (clientQueryCallCount === 2) return undefined;
          // 3..N: INSERT each new order_item
          const insertIndex = clientQueryCallCount - 3;
          if (insertIndex < requestItems.length) {
            const reqItem = requestItems[insertIndex]!;
            const menuItem = menuItems.find((mi) => mi.id === reqItem.menuItemId)!;
            return {
              rows: [{
                id: `item-${insertIndex}`,
                order_id: orderId,
                menu_item_id: reqItem.menuItemId,
                item_name: menuItem.name,
                unit_price_cents: menuItem.price_cents,
                quantity: reqItem.quantity,
              }],
            };
          }
          // N+1: UPDATE orders.total_amount_cents
          // N+2: COMMIT
          return undefined;
        });

        const req = mockRequest({ items: requestItems }, { id: orderId });
        const res = mockResponse();

        await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

        // Assert successful response
        expect(res.statusCode).toBe(200);

        // Compute expected total: Σ(price_cents × quantity)
        const expectedTotal = requestItems.reduce((sum, reqItem) => {
          const menuItem = menuItems.find((mi) => mi.id === reqItem.menuItemId)!;
          return sum + menuItem.price_cents * reqItem.quantity;
        }, 0);

        // Property 1a: totalAmountCents === Σ(price_cents × quantity)
        expect(res.body.totalAmountCents).toBe(expectedTotal);

        // Property 1b: each item's unitPriceCents matches the menu item's current price
        for (const returnedItem of res.body.items) {
          const menuItem = menuItems.find((mi) => mi.id === returnedItem.menuItemId)!;
          expect(returnedItem.unitPriceCents).toBe(menuItem.price_cents);
        }
      }),
      { numRuns: 100 }
    );
  });
});
