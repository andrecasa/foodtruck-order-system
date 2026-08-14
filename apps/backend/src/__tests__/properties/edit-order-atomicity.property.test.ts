import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

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

/**
 * Feature: edit-order, Property 5: Transaction Atomicity on Failure
 *
 * For any valid update request where a database error occurs during the transaction
 * (after BEGIN but before COMMIT), the order's items and total SHALL remain identical
 * to their state before the request was made (rollback guarantee).
 *
 * This test verifies that:
 * - ROLLBACK is called when any transaction step fails
 * - HTTP 500 is returned with the appropriate error message
 * - No partial state is ever committed
 *
 * **Validates: Requirements 5.1, 5.5**
 */
describe('Property 5: Transaction Atomicity on Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  // Generators
  const validUuid = fc.uuid();
  const validQuantity = fc.integer({ min: 1, max: 99 });
  const priceCents = fc.integer({ min: 100, max: 50000 });

  // Generate 1–5 items with unique menuItemIds
  const orderItemsArb = fc
    .array(
      fc.record({
        menuItemId: validUuid,
        quantity: validQuantity,
        priceCents: priceCents,
        name: fc.stringMatching(/^[A-Za-z]{3,15}$/),
      }),
      { minLength: 1, maxLength: 5 }
    )
    .chain((items) => {
      // Ensure unique menuItemIds
      const seen = new Set<string>();
      const unique = items.filter((item) => {
        if (seen.has(item.menuItemId)) return false;
        seen.add(item.menuItemId);
        return true;
      });
      if (unique.length === 0) return fc.constant([items[0]]);
      return fc.constant(unique);
    });

  // The failure point index within the transaction:
  // 0 = DELETE old items (after BEGIN), 1..N-1 = INSERT items, N = UPDATE total
  // We use this to decide which step after BEGIN will throw
  const failureStepArb = (maxSteps: number) =>
    fc.integer({ min: 0, max: maxSteps });

  it('ROLLBACK is called and 500 is returned when DB error occurs at any point during the transaction', async () => {
    await fc.assert(
      fc.asyncProperty(orderItemsArb, async (items) => {
        const numItems = items.length;
        // Transaction steps after BEGIN:
        // step 0 = DELETE, steps 1..numItems = INSERT each item, step numItems+1 = UPDATE total
        const maxFailStep = numItems + 1;

        // Test each possible failure point
        for (let failAt = 0; failAt <= maxFailStep; failAt++) {
          // Reset all mocks for this iteration
          mockClientQuery.mockReset();
          mockPoolQuery.mockReset();
          mockRelease.mockReset();
          mockConnect.mockReset();
          mockChannel.mockClear();
          mockSend.mockClear();

          mockConnect.mockResolvedValue({
            query: mockClientQuery,
            release: mockRelease,
          });

          mockChannel.mockReturnValue({
            send: mockSend.mockResolvedValue(undefined),
          });

          const orderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

          // Setup: order lookup returns valid order in 'aguardando'
          mockPoolQuery.mockResolvedValueOnce({
            rows: [{
              id: orderId,
              daily_number: 1,
              customer_name: 'Test',
              origin: 'presencial',
              status: 'aguardando',
              payment_status: 'pendente',
              payment_method: null,
              total_amount_cents: 1000,
              order_date: '2024-06-15',
              created_at: '2024-06-15T10:00:00.000Z',
              started_at: null,
              ready_at: null,
              delivered_at: null,
              paid_at: null,
            }],
          });

          // Setup: menu items lookup returns all items as active
          mockPoolQuery.mockResolvedValueOnce({
            rows: items.map((item) => ({
              id: item.menuItemId,
              name: item.name,
              price_cents: item.priceCents,
              status: 'ativo',
            })),
          });

          // Setup transaction steps
          // Step 0: BEGIN always succeeds
          mockClientQuery.mockResolvedValueOnce(undefined);

          // Now set up steps after BEGIN, failing at the designated step
          let stepIndex = 0;
          // Step: DELETE old items
          if (stepIndex === failAt) {
            mockClientQuery.mockRejectedValueOnce(new Error('DB error at DELETE'));
          } else {
            mockClientQuery.mockResolvedValueOnce(undefined);
          }
          stepIndex++;

          // Steps: INSERT each item
          for (let i = 0; i < numItems; i++) {
            if (stepIndex === failAt) {
              mockClientQuery.mockRejectedValueOnce(new Error(`DB error at INSERT item ${i}`));
            } else {
              mockClientQuery.mockResolvedValueOnce({
                rows: [{
                  id: `item-uuid-${i}`,
                  order_id: orderId,
                  menu_item_id: items[i].menuItemId,
                  item_name: items[i].name,
                  unit_price_cents: items[i].priceCents,
                  quantity: items[i].quantity,
                }],
              });
            }
            stepIndex++;
          }

          // Step: UPDATE total
          if (stepIndex === failAt) {
            mockClientQuery.mockRejectedValueOnce(new Error('DB error at UPDATE total'));
          } else {
            mockClientQuery.mockResolvedValueOnce(undefined);
          }

          // ROLLBACK succeeds (always set up after the error)
          mockClientQuery.mockResolvedValueOnce(undefined);

          // Build request
          const requestItems = items.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
          }));

          const req = mockRequest({ items: requestItems }, { id: orderId });
          const res = mockResponse();

          await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

          // Must return 500
          expect(res.statusCode).toBe(500);
          expect(res.body.error).toBe('INTERNAL_ERROR');
          expect(res.body.message).toBe('Erro ao atualizar itens do pedido.');

          // ROLLBACK must have been called
          const allCalls = mockClientQuery.mock.calls;
          const rollbackCalled = allCalls.some(
            (call) => typeof call[0] === 'string' && call[0] === 'ROLLBACK'
          );
          expect(rollbackCalled).toBe(true);

          // Client must have been released
          expect(mockRelease).toHaveBeenCalled();

          // COMMIT must NOT have been called
          const commitCalled = allCalls.some(
            (call) => typeof call[0] === 'string' && call[0] === 'COMMIT'
          );
          expect(commitCalled).toBe(false);

          // No broadcast should have been attempted
          expect(mockSend).not.toHaveBeenCalled();
        }
      }),
      { numRuns: 100 }
    );
  });
});
