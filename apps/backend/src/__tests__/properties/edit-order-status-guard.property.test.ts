import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import * as fc from 'fast-check';
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
const mockQuery = vi.fn();
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
 * Feature: edit-order, Property 2: Payment Guard
 *
 * For any order whose payment_status is `pago` (regardless of order status),
 * submitting an update items request SHALL be rejected with HTTP 422,
 * and the order's items and total SHALL remain unchanged.
 *
 * For any order whose payment_status is `pendente` (in any order status),
 * the payment guard SHALL NOT reject the request.
 */
describe('Property 2: Payment Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });

    mockChannel.mockReturnValue({
      send: mockSend.mockResolvedValue(undefined),
    });
  });

  // Generator: any order status
  const anyOrderStatus = fc.constantFrom('aguardando', 'preparando', 'pronto', 'entregue');

  // Generator: valid UUID
  const validUuid = fc.uuid();

  // Generator: valid quantity (1-99)
  const validQuantity = fc.integer({ min: 1, max: 99 });

  // Generator: valid items list (1-10 items with unique menuItemIds)
  const validItemsList = fc.uniqueArray(
    fc.record({
      menuItemId: validUuid,
      quantity: validQuantity,
    }),
    { minLength: 1, maxLength: 10, selector: (item) => item.menuItemId }
  );

  // Generator: random total amount for the existing order
  const totalAmountCents = fc.integer({ min: 100, max: 100000 });

  // Generator: orderId
  const orderId = validUuid;

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

  it('rejects update with 422 for any paid order regardless of status', async () => {
    await fc.assert(
      fc.asyncProperty(
        orderId,
        anyOrderStatus,
        validItemsList,
        totalAmountCents,
        async (id, status, items, total) => {
          vi.clearAllMocks();
          mockConnect.mockResolvedValue({
            query: mockQuery,
            release: mockRelease,
          });

          // Setup order lookup returning a PAID order
          mockPoolQuery.mockResolvedValueOnce({
            rows: [{
              id,
              daily_number: 1,
              customer_name: 'Test Customer',
              origin: 'presencial',
              status,
              payment_status: 'pago',
              payment_method: 'pix',
              total_amount_cents: total,
              order_date: '2024-06-15',
              created_at: '2024-06-15T13:00:00.000Z',
              started_at: null,
              ready_at: null,
              delivered_at: null,
              paid_at: '2024-06-15T13:05:00.000Z',
            }],
          });

          const req = mockRequest({ items }, { id });
          const res = mockResponse();

          await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

          // Property: response is 422 with VALIDATION_ERROR
          expect(res.statusCode).toBe(422);
          expect(res.body.error).toBe('VALIDATION_ERROR');
          expect(res.body.message).toBe('Pedido não pode ser editado após o pagamento');

          // Property: no transaction was started (order remains unchanged)
          expect(mockConnect).not.toHaveBeenCalled();
          expect(mockQuery).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('does not modify order data when payment guard rejects (no DB writes)', async () => {
    await fc.assert(
      fc.asyncProperty(
        orderId,
        anyOrderStatus,
        validItemsList,
        async (id, status, items) => {
          vi.clearAllMocks();
          mockConnect.mockResolvedValue({
            query: mockQuery,
            release: mockRelease,
          });

          // Setup order lookup — paid order
          mockPoolQuery.mockResolvedValueOnce({
            rows: [{
              id,
              daily_number: 3,
              customer_name: 'Maria',
              origin: 'whatsapp',
              status,
              payment_status: 'pago',
              payment_method: 'dinheiro',
              total_amount_cents: 5000,
              order_date: '2024-06-15',
              created_at: '2024-06-15T13:00:00.000Z',
              started_at: null,
              ready_at: null,
              delivered_at: null,
              paid_at: '2024-06-15T13:10:00.000Z',
            }],
          });

          const req = mockRequest({ items }, { id });
          const res = mockResponse();

          await updateOrderItems(req as AuthenticatedRequest, res as unknown as Response);

          // Property: no database connection was acquired for transaction
          expect(mockConnect).not.toHaveBeenCalled();

          // Property: no broadcast event was sent
          expect(mockChannel).not.toHaveBeenCalled();
          expect(mockSend).not.toHaveBeenCalled();

          // Property: only one pool.query call was made (the order lookup)
          expect(mockPoolQuery).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });
});
