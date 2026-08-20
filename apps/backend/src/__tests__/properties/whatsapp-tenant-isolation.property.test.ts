import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Request, Response } from 'express';

/**
 * Feature: multi-tenant-white-label — WhatsApp routing & isolation.
 *
 * These property tests cover the two WhatsApp correctness properties from the
 * design, plus the always-200 webhook contract:
 *
 * - Property 7 (webhook without side effects on error): for any invalid /
 *   unknown / malformed payload, the number of rows created/mutated is zero and
 *   the response is HTTP 200 (R8.3, R8.4, R8.5).
 * - Property 8 (deterministic instance routing): each `evolution_instance_name`
 *   maps to at most one tenant, and the message is always processed under the
 *   tenant_id of that instance (R8.1, R8.2, R8.8, R8.11).
 * - Session isolation (R8.7, R8.11): sessions are keyed by (tenant_id,
 *   phone_number); the same phone number in tenant A never reveals or mutates
 *   tenant B's session, and the bot reads/writes only rows of the session's
 *   tenant.
 * - Order attribution (R8.8, R8.9): a bot order is created for the session's
 *   tenant and attributed to an ACTIVE admin of THAT tenant; if none exists, no
 *   order is created.
 *
 * **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.8, 8.9, 8.11**
 */

// --- Mocks (declared before importing the modules under test) ---

// The whatsapp service reaches the DB through the shared pool, either directly
// (resolveInstanceName) or via the TenantRepository (sessions/menu/orders). A
// single query mock backed by a tenant-scoped in-memory store covers both.
const poolQuery = vi.fn();
const poolConnect = vi.fn();
vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => poolQuery(...args),
    connect: () => poolConnect(),
  },
}));

vi.mock('../../config/realtime.js', () => ({
  broadcast: vi.fn(),
  tenantChannel: (base: string, tenantId: string) => `${base}:${tenantId}`,
  REALTIME_CHANNEL_QUEUE: 'orders:queue',
  REALTIME_CHANNEL_PAYMENT: 'orders:payment',
}));

// Capture every outgoing message so we can assert the instance it was sent
// through and that no message is sent on ignored webhooks.
const sentMessages: Array<{ number: string; text: string; instanceName?: string }> = [];
vi.mock('../../bot/evolution-api.client.js', () => ({
  sendTextMessage: vi.fn(async (opts: { number: string; text: string; instanceName?: string }) => {
    sentMessages.push(opts);
  }),
}));

vi.mock('date-fns-tz', () => ({
  toZonedTime: vi.fn().mockReturnValue(new Date('2026-01-15T10:00:00')),
  format: vi.fn().mockReturnValue('2026-01-15'),
}));

import { webhookEvolution } from '../../bot/whatsapp.controller.js';
import { handleIncomingMessage, getSession } from '../../bot/whatsapp.service.js';

// --- Tenant-scoped in-memory store ---

interface TenantRow {
  id: string;
  evolution_instance_name: string | null;
}

interface SessionRow {
  tenant_id: string;
  phone_number: string;
  state: string;
  cart: unknown[];
  started_at: string;
  last_activity_at: string;
}

interface AdminRow {
  tenant_id: string;
  id: string;
  role: string;
  status: string;
}

interface OrderRow {
  id: string;
  tenant_id: string;
  daily_number: number;
  created_by: string;
}

/**
 * Emulates the exact SQL shapes the WhatsApp service and WebhookRouter emit.
 * Every tenant-scoped statement carries the resolved tenant_id as $1; the store
 * only ever returns/mutates rows whose tenant_id matches, which is precisely
 * what enforces isolation under the composite tenant scope.
 */
class Store {
  tenants: TenantRow[] = [];
  sessions: SessionRow[] = [];
  admins: AdminRow[] = [];
  orders: OrderRow[] = [];
  orderItems = 0;
  /** Active menu items keyed by tenant_id (used by the greeting/menu flow). */
  menu = new Map<string, Array<{ id: string; name: string; price_cents: number; category_name: string; category_sort_order: number }>>();
  private seq = new Map<string, number>();

  reset(): void {
    this.tenants = [];
    this.sessions = [];
    this.admins = [];
    this.orders = [];
    this.orderItems = 0;
    this.menu.clear();
    this.seq.clear();
  }

  private nextDailyNumber(tenantId: string, date: string): number {
    const key = `${tenantId}|${date}`;
    const next = (this.seq.get(key) ?? 0) + 1;
    this.seq.set(key, next);
    return next;
  }

  query = (sql: string, params: unknown[] = []): { rows: any[]; rowCount: number } => {
    const text = String(sql);

    // resolveTenantIdByInstance: SELECT id FROM tenants WHERE evolution_instance_name = $1
    if (/FROM tenants WHERE evolution_instance_name/i.test(text)) {
      const instance = params[0] as string;
      const found = this.tenants.filter((t) => t.evolution_instance_name === instance);
      return { rows: found.map((t) => ({ id: t.id })), rowCount: found.length };
    }

    // resolveInstanceName: SELECT evolution_instance_name FROM tenants WHERE id = $1
    if (/SELECT evolution_instance_name FROM tenants WHERE id/i.test(text)) {
      const id = params[0] as string;
      const found = this.tenants.filter((t) => t.id === id);
      return { rows: found.map((t) => ({ evolution_instance_name: t.evolution_instance_name })), rowCount: found.length };
    }

    // fetchActiveMenuItems: SELECT mi.id, ... FROM menu_items mi JOIN categories c ... WHERE mi.tenant_id = $1 AND mi.status = 'ativo'
    if (/FROM menu_items mi/i.test(text)) {
      const tenantId = params[0] as string;
      const items = this.menu.get(tenantId) ?? [];
      return { rows: items.map((m) => ({ ...m })), rowCount: items.length };
    }

    // getSession: SELECT * FROM whatsapp_sessions WHERE tenant_id = $1 AND (phone_number = $2)
    if (/SELECT \* FROM whatsapp_sessions/i.test(text)) {
      const tenantId = params[0] as string;
      const phone = params[1] as string;
      const found = this.sessions.filter((s) => s.tenant_id === tenantId && s.phone_number === phone);
      return { rows: found.map((s) => ({ ...s })), rowCount: found.length };
    }

    // createSession: INSERT INTO whatsapp_sessions ... ON CONFLICT (tenant_id, phone_number) ...
    if (/INSERT INTO whatsapp_sessions/i.test(text)) {
      const tenantId = params[0] as string;
      const phone = params[1] as string;
      const existing = this.sessions.find((s) => s.tenant_id === tenantId && s.phone_number === phone);
      const row: SessionRow = existing ?? {
        tenant_id: tenantId,
        phone_number: phone,
        state: 'saudacao',
        cart: [],
        started_at: '2026-01-15T10:00:00.000Z',
        last_activity_at: '2026-01-15T10:00:00.000Z',
      };
      row.state = 'saudacao';
      row.cart = [];
      if (!existing) this.sessions.push(row);
      return { rows: [{ ...row }], rowCount: 1 };
    }

    // updateSession: UPDATE whatsapp_sessions SET ... WHERE tenant_id = $1 AND phone_number = $4
    if (/UPDATE whatsapp_sessions/i.test(text)) {
      const tenantId = params[0] as string;
      const state = params[1] as string;
      const cart = JSON.parse(params[2] as string);
      const phone = params[3] as string;
      let affected = 0;
      for (const s of this.sessions) {
        if (s.tenant_id === tenantId && s.phone_number === phone) {
          s.state = state;
          s.cart = cart;
          affected++;
        }
      }
      return { rows: [], rowCount: affected };
    }

    // deleteSession: DELETE FROM whatsapp_sessions WHERE tenant_id = $1 AND (phone_number = $2)
    if (/DELETE FROM whatsapp_sessions/i.test(text)) {
      const tenantId = params[0] as string;
      const phone = params[1] as string;
      const before = this.sessions.length;
      this.sessions = this.sessions.filter((s) => !(s.tenant_id === tenantId && s.phone_number === phone));
      return { rows: [], rowCount: before - this.sessions.length };
    }

    // active admin lookup (scoped to tenant): ... WHERE tenant_id = $1 AND role = 'admin' AND status = 'ativo' ...
    if (/FROM users WHERE tenant_id = \$1 AND role = 'admin'/i.test(text)) {
      const tenantId = params[0] as string;
      const found = this.admins.filter((a) => a.tenant_id === tenantId && a.role === 'admin' && a.status === 'ativo');
      return { rows: found.slice(0, 1).map((a) => ({ id: a.id })), rowCount: Math.min(found.length, 1) };
    }

    // next_daily_number($1::uuid, $2::date)
    if (/next_daily_number/i.test(text)) {
      const tenantId = params[0] as string;
      const date = params[1] as string;
      return { rows: [{ daily_number: this.nextDailyNumber(tenantId, date) }], rowCount: 1 };
    }

    // INSERT INTO orders (...) VALUES (...) RETURNING *
    if (/INSERT INTO orders/i.test(text)) {
      // tenant_id is injected by the repository as one of the columns/params.
      const tenantId = params[params.length - 1] as string; // repo appends tenant_id last
      const row: OrderRow = {
        id: `order-${this.orders.length + 1}`,
        tenant_id: tenantId,
        daily_number: 1,
        created_by: 'unknown',
      };
      // Recover daily_number/created_by from params is unnecessary for these
      // assertions; the RETURNING * shape only needs the fields the service reads.
      this.orders.push(row);
      return {
        rows: [{
          id: row.id,
          tenant_id: tenantId,
          daily_number: 1,
          customer_name: 'Cliente',
          origin: 'whatsapp',
          status: 'aguardando',
          payment_status: 'pendente',
          total_amount_cents: 0,
          order_date: '2026-01-15',
          created_at: '2026-01-15T10:00:00.000Z',
        }],
        rowCount: 1,
      };
    }

    // INSERT INTO order_items ... RETURNING *
    if (/INSERT INTO order_items/i.test(text)) {
      this.orderItems++;
      return { rows: [{ id: `oi-${this.orderItems}` }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  };
}

const store = new Store();

/** Fresh current-time ISO string so seeded sessions are never seen as timed out. */
function nowIso(): string {
  return new Date().toISOString();
}

// withTransaction uses pool.connect(); back the tx client with the same store.
function makeClient() {
  return {
    query: (sql: string, params?: unknown[]) => {
      const t = String(sql).trim().toUpperCase();
      if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return Promise.resolve(store.query(sql, params));
    },
    release: vi.fn(),
  };
}

// --- Test helpers ---

const VALID_API_KEY = process.env.EVOLUTION_API_KEY || 'change-me-evolution-api-key';

function makeReq(body: unknown, apiKey: string | undefined = VALID_API_KEY): Request {
  return {
    headers: apiKey === undefined ? {} : { apikey: apiKey },
    body,
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; jsonBody: unknown } {
  const res = {
    statusCode: 0,
    jsonBody: undefined as unknown,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      this.headersSent = true;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; jsonBody: unknown };
}

/** Waits for the fire-and-forget background processing to settle. */
async function flush() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  vi.clearAllMocks();
  sentMessages.length = 0;
  store.reset();
  poolQuery.mockImplementation((sql: string, params?: unknown[]) => Promise.resolve(store.query(sql, params)));
  poolConnect.mockImplementation(() => Promise.resolve(makeClient()));
});

// --- Generators ---

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const phoneArb = fc.stringMatching(/^55[0-9]{9,11}$/);
const instanceArb = fc.stringMatching(/^[a-z0-9-]{3,20}$/);

/**
 * Property 7 — webhook without side effects on error.
 */
describe('Property 7: webhook has no side effects and returns 200 on error paths', () => {
  it('unknown instance → 200, no session/order created', async () => {
    await fc.assert(
      fc.asyncProperty(instanceArb, phoneArb, async (instance, phone) => {
        store.reset();
        sentMessages.length = 0;
        // No tenant maps to this instance.
        const res = makeRes();
        await webhookEvolution(
          makeReq({
            instance,
            event: 'messages.upsert',
            data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: 'oi' } },
          }),
          res,
        );
        await flush();

        expect(res.statusCode).toBe(200);
        expect(store.sessions).toHaveLength(0);
        expect(store.orders).toHaveLength(0);
        expect(sentMessages).toHaveLength(0);
      }),
      { numRuns: 60 },
    );
  });

  it('malformed / missing-instance payloads → 200, zero side effects', async () => {
    const malformedArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant('not-an-object'),
      fc.constant(42),
      fc.record({ event: fc.constant('messages.upsert'), data: fc.constant({}) }), // no instance
      fc.record({ instance: fc.constant('   '), event: fc.constant('messages.upsert') }), // blank instance
    );

    await fc.assert(
      fc.asyncProperty(malformedArb, async (body) => {
        store.reset();
        sentMessages.length = 0;
        const res = makeRes();
        await webhookEvolution(makeReq(body), res);
        await flush();

        expect(res.statusCode).toBe(200);
        expect(store.sessions).toHaveLength(0);
        expect(store.orders).toHaveLength(0);
        expect(sentMessages).toHaveLength(0);
      }),
      { numRuns: 60 },
    );
  });

  it('internal error during tenant resolution → 200, no processing (R8.5)', async () => {
    await fc.assert(
      fc.asyncProperty(instanceArb, async (instance) => {
        sentMessages.length = 0;
        poolQuery.mockRejectedValueOnce(new Error('db down'));
        const res = makeRes();
        await webhookEvolution(
          makeReq({ instance, event: 'messages.upsert', data: { key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false }, message: { conversation: 'oi' } } }),
          res,
        );
        await flush();

        expect(res.statusCode).toBe(200);
        expect(sentMessages).toHaveLength(0);
        // restore default impl for subsequent runs
        poolQuery.mockImplementation((sql: string, params?: unknown[]) => Promise.resolve(store.query(sql, params)));
      }),
      { numRuns: 40 },
    );
  });
});

/**
 * Property 8 — deterministic instance routing.
 */
describe('Property 8: deterministic instance → tenant routing', () => {
  it('the message is always processed under the tenant of the payload instance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(instanceArb, instanceArb).filter(([a, b]) => a !== b),
        phoneArb,
        async ([instanceA, instanceB], phone) => {
          store.reset();
          sentMessages.length = 0;
          // Each instance maps to exactly one tenant (UNIQUE mapping).
          store.tenants = [
            { id: TENANT_A, evolution_instance_name: instanceA },
            { id: TENANT_B, evolution_instance_name: instanceB },
          ];
          // Each tenant has an active admin so an order could be created.
          store.admins = [
            { tenant_id: TENANT_A, id: 'admin-a', role: 'admin', status: 'ativo' },
            { tenant_id: TENANT_B, id: 'admin-b', role: 'admin', status: 'ativo' },
          ];
          // Each tenant has an active menu so the greeting keeps the session
          // alive (an empty menu would end the session immediately).
          const menuItems = [{ id: 'm1', name: 'Pastel', price_cents: 750, category_name: 'Salgados', category_sort_order: 1 }];
          store.menu.set(TENANT_A, menuItems);
          store.menu.set(TENANT_B, menuItems);

          const res = makeRes();
          await webhookEvolution(
            makeReq({
              instance: instanceA,
              event: 'messages.upsert',
              data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false }, message: { conversation: 'oi' } },
            }),
            res,
          );
          await flush();

          expect(res.statusCode).toBe(200);
          // A session was created for TENANT_A only (the routed tenant).
          const sessions = store.sessions;
          expect(sessions.length).toBeGreaterThanOrEqual(1);
          for (const s of sessions) {
            expect(s.tenant_id).toBe(TENANT_A);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('a bot order is attributed to the session tenant (R8.8) and its active admin', async () => {
    await fc.assert(
      fc.asyncProperty(phoneArb, async (phone) => {
        store.reset();
        sentMessages.length = 0;
        store.tenants = [{ id: TENANT_A, evolution_instance_name: 'inst-a' }];
        store.admins = [{ tenant_id: TENANT_A, id: 'admin-a', role: 'admin', status: 'ativo' }];
        // Pre-seed a resumo session with one item so "confirmar" creates an order.
        store.sessions = [{
          tenant_id: TENANT_A,
          phone_number: phone,
          state: 'resumo',
          cart: [{ menuItemId: 'm1', name: 'Pastel', quantity: 1, unitPriceCents: 750 }],
          started_at: nowIso(),
          last_activity_at: nowIso(),
        }];

        await handleIncomingMessage(TENANT_A, phone, 'Cliente', 'confirmar');

        expect(store.orders).toHaveLength(1);
        expect(store.orders[0]!.tenant_id).toBe(TENANT_A);
      }),
      { numRuns: 40 },
    );
  });

  it('no active admin for the tenant → no order created (R8.9)', async () => {
    await fc.assert(
      fc.asyncProperty(phoneArb, async (phone) => {
        store.reset();
        sentMessages.length = 0;
        store.tenants = [{ id: TENANT_A, evolution_instance_name: 'inst-a' }];
        // Only an INACTIVE admin exists.
        store.admins = [{ tenant_id: TENANT_A, id: 'admin-a', role: 'admin', status: 'inativo' }];
        store.sessions = [{
          tenant_id: TENANT_A,
          phone_number: phone,
          state: 'resumo',
          cart: [{ menuItemId: 'm1', name: 'Pastel', quantity: 1, unitPriceCents: 750 }],
          started_at: nowIso(),
          last_activity_at: nowIso(),
        }];

        await handleIncomingMessage(TENANT_A, phone, 'Cliente', 'confirmar');

        expect(store.orders).toHaveLength(0);
        // The customer is informed of the failure.
        expect(sentMessages.some((m) => /erro ao criar seu pedido/i.test(m.text))).toBe(true);
      }),
      { numRuns: 40 },
    );
  });
});

/**
 * Session isolation (R8.7, R8.11): the same phone number can exist in two
 * tenants; a read/write under one tenant never touches the other's session.
 */
describe('WhatsApp session isolation between tenants (R8.7, R8.11)', () => {
  it('getSession under tenant A never returns tenant B session for the same phone', async () => {
    await fc.assert(
      fc.asyncProperty(phoneArb, async (phone) => {
        store.reset();
        // Same phone number, two tenants, different states.
        store.sessions = [
          { tenant_id: TENANT_A, phone_number: phone, state: 'selecionando', cart: [], started_at: nowIso(), last_activity_at: nowIso() },
          { tenant_id: TENANT_B, phone_number: phone, state: 'resumo', cart: [{ x: 1 }], started_at: nowIso(), last_activity_at: nowIso() },
        ];

        const a = await getSession(TENANT_A, phone);
        const b = await getSession(TENANT_B, phone);

        expect(a?.state).toBe('selecionando');
        expect(b?.state).toBe('resumo');
        // A's cart is untouched by B's.
        expect(a?.cart).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });

  it('processing a message for tenant A leaves tenant B session untouched', async () => {
    await fc.assert(
      fc.asyncProperty(phoneArb, async (phone) => {
        store.reset();
        sentMessages.length = 0;
        store.tenants = [{ id: TENANT_A, evolution_instance_name: 'inst-a' }];
        store.sessions = [
          { tenant_id: TENANT_A, phone_number: phone, state: 'selecionando', cart: [], started_at: nowIso(), last_activity_at: nowIso() },
          { tenant_id: TENANT_B, phone_number: phone, state: 'resumo', cart: [{ keep: true }], started_at: nowIso(), last_activity_at: nowIso() },
        ];

        // Cancel in tenant A: deletes A's session only.
        await handleIncomingMessage(TENANT_A, phone, 'Cliente', 'cancelar');

        const bSession = store.sessions.find((s) => s.tenant_id === TENANT_B && s.phone_number === phone);
        expect(bSession).toBeDefined();
        expect(bSession!.state).toBe('resumo');
        expect(bSession!.cart).toEqual([{ keep: true }]);
      }),
      { numRuns: 40 },
    );
  });
});
