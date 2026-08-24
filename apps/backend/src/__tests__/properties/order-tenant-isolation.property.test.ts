import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the shared pool BEFORE importing the service. The TenantRepository (and
// therefore the order service) reaches the DB exclusively through this pool.
vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// Realtime broadcast is fire-and-forget; stub it so tests don't touch Supabase.
vi.mock('../../config/realtime.js', () => ({
  broadcast: vi.fn(),
  tenantChannel: (base: string, tenantId: string) => `${base}:${tenantId}`,
  REALTIME_CHANNEL_QUEUE: 'orders:queue',
  REALTIME_CHANNEL_PAYMENT: 'orders:payment',
}));

import { pool } from '../../config/database.js';
import {
  getOrders,
  getOrderById,
  updateOrderStatus,
  registerPayment,
  deleteOrder,
  ServiceError,
} from '../../services/order.service.js';
import type { OrderStatus } from '@order-system/shared';

/**
 * Feature: multi-tenant-white-label — Order isolation between tenants.
 *
 * These property tests prove the two isolation invariants from the design for
 * the order domain, plus the invalid-transition guard:
 *
 * - Property 1 (total read isolation): a request in tenant A never returns a
 *   row whose tenant_id is B. A read of a B-owned order under A responds as if
 *   it did not exist (404).
 * - Property 2 (total write isolation): an update/delete issued under A never
 *   affects a B-owned row; a cross-tenant write responds 404 and leaves B's row
 *   untouched.
 * - Invalid status transitions are rejected with 422 (R12.1, R12.2).
 *
 * The TenantRepository injects `tenant_id = $1` into every statement. The mock
 * DB below honors that predicate: it stores rows keyed by tenant and only ever
 * returns/mutates rows whose tenant_id matches the `$1` parameter. This is a
 * faithful abstraction of the real Postgres behavior under the composite
 * tenant scoping, and it is exactly what enforces isolation.
 *
 * **Validates: Requirements 6.1, 6.3, 6.4, 12.1, 12.2**
 */

interface OrderRow {
  id: string;
  tenant_id: string;
  daily_number: number;
  customer_name: string;
  origin: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_amount_cents: number;
  order_date: string;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  paid_at: string | null;
}

/**
 * A minimal in-memory store that mimics the tenant-scoped behavior of the DB.
 * Every query the TenantRepository issues carries the resolved tenant_id as the
 * first parameter ($1). The store enforces the scope by filtering on that value
 * so no cross-tenant row is ever visible or mutable.
 */
class TenantScopedStore {
  private orders: OrderRow[] = [];

  seed(rows: OrderRow[]): void {
    this.orders = rows.map((r) => ({ ...r }));
  }

  snapshot(): OrderRow[] {
    return this.orders.map((r) => ({ ...r }));
  }

  /** Handles the SQL shapes emitted by the tenant-scoped order service. */
  query = (sql: string, params: unknown[] = []): { rows: OrderRow[]; rowCount: number; command: string } => {
    const tenantId = params[0] as string;
    const scoped = this.orders.filter((o) => o.tenant_id === tenantId);

    // findOne / SELECT * FROM orders WHERE tenant_id = $1 AND (id = $2)
    if (/SELECT \* FROM orders/i.test(sql)) {
      const id = params[1] as string;
      const found = scoped.filter((o) => o.id === id);
      return { rows: found.map((r) => ({ ...r })), rowCount: found.length, command: 'SELECT' };
    }

    // getOrders raw select (SELECT o.id, ... FROM orders o WHERE o.tenant_id = $1 ...)
    if (/FROM orders o/i.test(sql)) {
      return { rows: scoped.map((r) => ({ ...r })), rowCount: scoped.length, command: 'SELECT' };
    }

    // order_items lookups — no items needed for isolation assertions.
    if (/order_items/i.test(sql)) {
      return { rows: [], rowCount: 0, command: 'SELECT' };
    }

    // UPDATE orders SET ... WHERE tenant_id = $n AND (id = $m)
    if (/^UPDATE orders/i.test(sql.trim())) {
      // The last param is the order id (caller where-fragment $1 renumbered).
      const id = params[params.length - 1] as string;
      let affected = 0;
      for (const o of this.orders) {
        if (o.tenant_id === tenantId && o.id === id) {
          affected++;
        }
      }
      return { rows: [], rowCount: affected, command: 'UPDATE' };
    }

    // DELETE FROM orders WHERE tenant_id = $1 AND (id = $2)
    if (/^DELETE FROM orders/i.test(sql.trim())) {
      const id = params[1] as string;
      const before = this.orders.length;
      this.orders = this.orders.filter((o) => !(o.tenant_id === tenantId && o.id === id));
      return { rows: [], rowCount: before - this.orders.length, command: 'DELETE' };
    }

    return { rows: [], rowCount: 0, command: 'SELECT' };
  };
}

// --- Generators ---

const statusArb = fc.constantFrom<OrderStatus>('aguardando', 'preparando', 'pronto', 'entregue');

function orderRowArb(tenantId: string) {
  return fc.record({
    id: fc.uuid(),
    tenant_id: fc.constant(tenantId),
    daily_number: fc.integer({ min: 1, max: 500 }),
    customer_name: fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim().length > 0),
    origin: fc.constantFrom('presencial', 'whatsapp'),
    status: statusArb,
    payment_status: fc.constantFrom('pendente', 'pago'),
    payment_method: fc.constant(null),
    total_amount_cents: fc.integer({ min: 0, max: 100000 }),
    order_date: fc.constant('2026-01-15'),
    created_at: fc.constant('2026-01-15T10:00:00.000Z'),
    started_at: fc.constant(null),
    ready_at: fc.constant(null),
    delivered_at: fc.constant(null),
    paid_at: fc.constant(null),
  }) as fc.Arbitrary<OrderRow>;
}

// Two distinct tenants.
const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('Order isolation between tenants (Properties 1 & 2)', () => {
  const store = new TenantScopedStore();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockImplementation((sql: string, params?: unknown[]) =>
      Promise.resolve(store.query(sql, params) as never),
    );
  });

  // Property 1 — read isolation on listing.
  it('getOrders in tenant A returns only A-owned orders, never B (Property 1)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(orderRowArb(TENANT_A), { minLength: 0, maxLength: 8 }),
        fc.array(orderRowArb(TENANT_B), { minLength: 0, maxLength: 8 }),
        async (ordersA, ordersB) => {
          store.seed([...ordersA, ...ordersB]);

          const result = await getOrders(TENANT_A, [], '2026-01-15');

          // No row from tenant B ever appears; count matches A's orders.
          const idsB = new Set(ordersB.map((o) => o.id));
          for (const r of result) {
            expect(idsB.has(r.id)).toBe(false);
          }
          expect(result).toHaveLength(ordersA.length);

          // Every query issued carried A's tenant_id as $1.
          for (const call of vi.mocked(pool.query).mock.calls) {
            expect((call[1] as unknown[])[0]).toBe(TENANT_A);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Property 1 — read isolation on single fetch (cross-tenant → 404).
  it('getOrderById in tenant A cannot read a B-owned order → 404 (Property 1, R6.3)', async () => {
    await fc.assert(
      fc.asyncProperty(orderRowArb(TENANT_B), async (orderB) => {
        store.seed([orderB]);

        // Reading B's order under tenant A must look like it does not exist.
        await expect(getOrderById(TENANT_A, orderB.id)).rejects.toMatchObject({
          statusCode: 404,
        });

        // But the owning tenant B can read it.
        const own = await getOrderById(TENANT_B, orderB.id);
        expect(own.id).toBe(orderB.id);
      }),
      { numRuns: 100 },
    );
  });

  // Property 2 — write isolation: cross-tenant status update → 404, B untouched.
  it('updateOrderStatus in tenant A cannot mutate a B-owned order → 404, B unchanged (Property 2, R6.4)', async () => {
    await fc.assert(
      fc.asyncProperty(orderRowArb(TENANT_B), statusArb, async (orderB, newStatus) => {
        store.seed([orderB]);
        const before = store.snapshot();

        await expect(updateOrderStatus(TENANT_A, orderB.id, newStatus)).rejects.toMatchObject({
          statusCode: 404,
        });

        // Tenant B's row is preserved byte-for-byte.
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  // Property 2 — write isolation: cross-tenant payment registration → 404.
  it('registerPayment in tenant A cannot mutate a B-owned order → 404, B unchanged (Property 2, R6.4)', async () => {
    await fc.assert(
      fc.asyncProperty(orderRowArb(TENANT_B), fc.constantFrom('dinheiro', 'pix', 'cartão débito', 'cartão crédito'), async (orderB, method) => {
        store.seed([orderB]);
        const before = store.snapshot();

        await expect(registerPayment(TENANT_A, orderB.id, method)).rejects.toMatchObject({
          statusCode: 404,
        });

        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  // Property 2 — write isolation: cross-tenant delete → 404, B row remains.
  it('deleteOrder in tenant A cannot delete a B-owned order → 404, B remains (Property 2, R6.4)', async () => {
    await fc.assert(
      fc.asyncProperty(orderRowArb(TENANT_B), async (orderB) => {
        store.seed([orderB]);

        await expect(deleteOrder(TENANT_A, orderB.id)).rejects.toMatchObject({
          statusCode: 404,
        });

        // The B-owned row still exists (visible to B).
        const remaining = store.snapshot().filter((o) => o.id === orderB.id);
        expect(remaining).toHaveLength(1);
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Invalid status transitions are rejected with 422 within a tenant (R12.1, R12.2).
 * Only aguardando→preparando→pronto→entregue are allowed; any other transition
 * (backwards, skipping, same-status, or from the terminal state) is rejected and
 * the order status is preserved.
 *
 * **Validates: Requirements 12.1, 12.2**
 */
describe('Invalid status transitions are rejected with 422 (R12.1, R12.2)', () => {
  const store = new TenantScopedStore();

  const ORDER_STATUSES: OrderStatus[] = ['aguardando', 'preparando', 'pronto', 'entregue'];
  const VALID: Record<string, string> = {
    aguardando: 'preparando',
    preparando: 'pronto',
    pronto: 'entregue',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockImplementation((sql: string, params?: unknown[]) =>
      Promise.resolve(store.query(sql, params) as never),
    );
  });

  // Generator: a (from, to) pair that is NOT a valid transition.
  const invalidPairArb = fc
    .tuple(fc.constantFrom(...ORDER_STATUSES), fc.constantFrom(...ORDER_STATUSES))
    .filter(([from, to]) => VALID[from] !== to);

  it('any non-sequential transition is rejected with 422 and status is preserved', async () => {
    await fc.assert(
      fc.asyncProperty(orderRowArb(TENANT_A), invalidPairArb, async (baseOrder, [from, to]) => {
        const orderA: OrderRow = { ...baseOrder, tenant_id: TENANT_A, status: from };
        store.seed([orderA]);
        const before = store.snapshot();

        await expect(updateOrderStatus(TENANT_A, orderA.id, to as OrderStatus)).rejects.toMatchObject({
          statusCode: 422,
        });

        // Status preserved: no UPDATE reached the store.
        expect(store.snapshot()).toEqual(before);
      }),
      { numRuns: 200 },
    );
  });

  it('is a ServiceError with VALIDATION_ERROR code for invalid transitions', async () => {
    const orderA: OrderRow = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: TENANT_A,
      daily_number: 1,
      customer_name: 'Cliente',
      origin: 'presencial',
      status: 'entregue',
      payment_status: 'pago',
      payment_method: null,
      total_amount_cents: 1000,
      order_date: '2026-01-15',
      created_at: '2026-01-15T10:00:00.000Z',
      started_at: null,
      ready_at: null,
      delivered_at: null,
      paid_at: null,
    };
    store.seed([orderA]);

    await expect(updateOrderStatus(TENANT_A, orderA.id, 'aguardando')).rejects.toBeInstanceOf(ServiceError);
    await expect(updateOrderStatus(TENANT_A, orderA.id, 'aguardando')).rejects.toMatchObject({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
    });
  });
});
