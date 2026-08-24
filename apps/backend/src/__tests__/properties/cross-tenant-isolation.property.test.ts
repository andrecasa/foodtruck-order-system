import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 1: Isolamento total de leitura (R6)
 *
 * Para quaisquer tenants A ≠ B e qualquer recurso, uma requisição do tenant A
 * nunca retorna um registro cujo `tenant_id` seja B. Formalmente:
 *   ∀ r ∈ resultado(reqA) ⇒ r.tenant_id = A
 *
 * Este teste dirige os SERVIÇOS REAIS (menu, categorias, usuários e resumo) por
 * meio do `TenantRepository` REAL, respaldado por um "pool" em memória que honra
 * o filtro `tenant_id = $n` que o helper injeta em toda consulta. Provamos que,
 * povoando dados de dois tenants A e B, as leituras do tenant A jamais devolvem
 * linhas do tenant B — e vice-versa.
 *
 * **Validates: Requirements 6.1, 6.3, 6.4**
 */

// --- In-memory fake pool ------------------------------------------------------
//
// A store of rows per table. Every row carries a `tenant_id`. The fake executor
// implements just enough SQL to serve the queries the services issue, and — most
// importantly — it always applies the `tenant_id = $n` predicate that the
// TenantRepository injects. Cross-tenant leakage would only be possible if a row
// with a foreign tenant_id survived that predicate, so this exercises the real
// isolation boundary rather than a hand-written mirror of it.

interface Row {
  [column: string]: unknown;
  tenant_id: string;
}

interface Store {
  categories: Row[];
  menu_items: Row[];
  users: Row[];
  orders: Row[];
}

let store: Store;

/**
 * Finds the value bound to a `$n` placeholder in the params array.
 */
function param(params: unknown[], n: number): unknown {
  return params[n - 1];
}

/**
 * Extracts the tenant value the repository injected. By construction the helper
 * always places the tenant predicate as `tenant_id = $k`; we read whichever
 * placeholder it used and resolve it against the params.
 */
function tenantFromSql(sql: string, params: unknown[]): string | undefined {
  const m = sql.match(/tenant_id\s*=\s*\$(\d+)/);
  if (!m) return undefined;
  return param(params, Number(m[1])) as string;
}

/**
 * Minimal SQL execution over the in-memory store. It recognizes the shapes the
 * services produce (SELECT * FROM <table>, the menu JOIN, the categories JOIN,
 * and the summary aggregation) and ALWAYS filters by the injected tenant_id.
 */
function runQuery(sql: string, params: unknown[] = []): { rows: any[]; rowCount: number } {
  const tenant = tenantFromSql(sql, params);

  // Guard: the repository must always inject a tenant predicate. If it did not,
  // the fake refuses to run so the test fails loudly rather than leaking data.
  if (tenant === undefined) {
    throw new Error(`Query without tenant_id predicate reached the DB: ${sql}`);
  }

  // --- Summary daily aggregation (orders) ---
  if (/FROM\s+orders/i.test(sql) && /COUNT\(\*\)/i.test(sql)) {
    const targetDate = param(params, 2) as string;
    const scoped = store.orders.filter(
      (o) => o.tenant_id === tenant && o.order_date === targetDate,
    );
    const paid = scoped.filter((o) => o.payment_status === 'pago');
    const pending = scoped.filter((o) => o.payment_status === 'pendente');
    const sum = (rows: Row[], pred: (o: Row) => boolean) =>
      rows.filter(pred).reduce((s, o) => s + (o.total_amount_cents as number), 0);
    return {
      rows: [
        {
          total_orders: scoped.length,
          paid_orders: paid.length,
          pending_orders: pending.length,
          paid_total: sum(paid, () => true),
          pending_total: sum(pending, () => true),
          by_dinheiro: sum(paid, (o) => o.payment_method === 'dinheiro'),
          by_pix: sum(paid, (o) => o.payment_method === 'pix'),
          by_cartao_debito: sum(paid, (o) => o.payment_method === 'cartão débito'),
          by_cartao_credito: sum(paid, (o) => o.payment_method === 'cartão crédito'),
          // expose tenant_id of the scoped rows for the isolation assertion
          _tenant_ids: [...new Set(scoped.map((o) => o.tenant_id))],
        },
      ],
      rowCount: 1,
    };
  }

  // --- Categories list (JOIN menu_items for counts) ---
  if (/FROM\s+categories\s+c/i.test(sql)) {
    const scoped = store.categories.filter((c) => c.tenant_id === tenant);
    const rows = scoped.map((c) => ({
      id: c.id,
      name: c.name,
      sort_order: c.sort_order,
      status: c.status,
      created_at: c.created_at,
      item_count: store.menu_items.filter(
        (mi) => mi.tenant_id === tenant && mi.category_id === c.id,
      ).length,
      tenant_id: c.tenant_id,
    }));
    return { rows, rowCount: rows.length };
  }

  // --- Menu items (JOIN categories) ---
  if (/FROM\s+menu_items\s+mi/i.test(sql)) {
    const onlyActive = /mi\.status\s*=\s*'ativo'/i.test(sql);
    const scoped = store.menu_items.filter((mi) => mi.tenant_id === tenant);
    const rows = scoped
      .filter((mi) => (onlyActive ? mi.status === 'ativo' : true))
      .map((mi) => {
        const cat = store.categories.find(
          (c) => c.tenant_id === tenant && c.id === mi.category_id,
        );
        return {
          id: mi.id,
          name: mi.name,
          price_cents: mi.price_cents,
          status: mi.status,
          created_at: mi.created_at,
          updated_at: mi.updated_at,
          category_name: cat?.name ?? null,
          category_sort_order: cat?.sort_order ?? null,
          tenant_id: mi.tenant_id,
        };
      })
      .filter((r) => (onlyActive ? r.category_name !== null : true));
    return { rows, rowCount: rows.length };
  }

  // --- Generic SELECT * FROM <table> WHERE tenant_id = $1 [AND (...)] ---
  const genericMatch = sql.match(/FROM\s+(\w+)\s+WHERE/i);
  if (genericMatch && /^SELECT \*/i.test(sql)) {
    const table = genericMatch[1] as keyof Store;
    let scoped = (store[table] ?? []).filter((r) => r.tenant_id === tenant);

    // Honor an `id = $n` equality predicate (used by findOne / getUserById) so
    // a lookup of a foreign tenant's id correctly yields nothing.
    const idMatch = sql.match(/\bid\s*=\s*\$(\d+)/);
    if (idMatch) {
      const wantedId = param(params, Number(idMatch[1]));
      scoped = scoped.filter((r) => r.id === wantedId);
    }

    // Honor a `status = $n` equality predicate (used by listUsers filters).
    const statusMatch = sql.match(/\bstatus\s*=\s*\$(\d+)/);
    if (statusMatch) {
      const wantedStatus = param(params, Number(statusMatch[1]));
      scoped = scoped.filter((r) => r.status === wantedStatus);
    }

    // Honor a `role = $n` equality predicate (used by listUsers filters).
    const roleMatch = sql.match(/\brole\s*=\s*\$(\d+)/);
    if (roleMatch) {
      const wantedRole = param(params, Number(roleMatch[1]));
      scoped = scoped.filter((r) => r.role === wantedRole);
    }

    return { rows: scoped.map((r) => ({ ...r })), rowCount: scoped.length };
  }

  throw new Error(`Unhandled query in fake pool: ${sql}`);
}

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => Promise.resolve(runQuery(sql, params)),
    connect: vi.fn(),
  },
}));

// user.service transitively imports the supabase client, which requires env
// keys at module load. Mock it so the read-path functions we exercise can load
// without real credentials (no auth side effects are triggered by reads).
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { auth: { admin: { createUser: vi.fn(), deleteUser: vi.fn() } } },
}));

// date-fns-tz is used by the summary service; keep it real is fine, but we always
// pass an explicit date so the timezone branch is not exercised here.

import * as menuService from '../../services/menu.service.js';
import * as categoryService from '../../services/category.service.js';
import * as userService from '../../services/user.service.js';
import * as summaryService from '../../services/summary.service.js';

// --- Generators ---------------------------------------------------------------

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DATE = '2024-06-15';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function makeCategory(tenantId: string): Row {
  const id = nextId('cat');
  return {
    id,
    tenant_id: tenantId,
    name: `Cat ${id}`,
    sort_order: idCounter,
    status: 'ativo',
    created_at: '2024-01-01T00:00:00Z',
  };
}

function makeMenuItem(tenantId: string, categoryId: string, status: 'ativo' | 'inativo'): Row {
  const id = nextId('mi');
  return {
    id,
    tenant_id: tenantId,
    name: `Item ${id}`,
    price_cents: 500,
    category_id: categoryId,
    status,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

function makeUser(tenantId: string, role: string, status: 'ativo' | 'inativo'): Row {
  const id = nextId('user');
  return {
    id,
    tenant_id: tenantId,
    name: `User ${id}`,
    email: `${id}@example.com`,
    role,
    status,
    // user.service's mapToUserRecord calls .toISOString() on these.
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
  };
}

function makeOrder(tenantId: string): Row {
  const id = nextId('order');
  return {
    id,
    tenant_id: tenantId,
    order_date: DATE,
    total_amount_cents: 1000,
    payment_status: 'pago',
    payment_method: 'pix',
  };
}

/**
 * Populates the store with N rows per resource for BOTH tenants, so any read
 * from one tenant has genuine other-tenant rows it could accidentally return.
 */
function seedBothTenants(countA: number, countB: number): void {
  store = { categories: [], menu_items: [], users: [], orders: [] };
  idCounter = 0;

  for (const [tenant, count] of [
    [TENANT_A, countA],
    [TENANT_B, countB],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const cat = makeCategory(tenant);
      store.categories.push(cat);
      store.menu_items.push(makeMenuItem(tenant, cat.id as string, 'ativo'));
      store.menu_items.push(makeMenuItem(tenant, cat.id as string, 'inativo'));
      store.users.push(makeUser(tenant, i === 0 ? 'admin' : 'atendente', 'ativo'));
      store.orders.push(makeOrder(tenant));
    }
  }
}

// --- Tests --------------------------------------------------------------------

describe('Property 1: Isolamento total de leitura (menu, categorias, usuários, resumo)', () => {
  beforeEach(() => {
    // Summary caches per tenant/month; clear so each generated run is fresh.
    summaryService.invalidateMonthlySummaryCache(TENANT_A);
    summaryService.invalidateMonthlySummaryCache(TENANT_B);
  });

  it('listCategories only ever returns categories of the requesting tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        async (a, b) => {
          seedBothTenants(a, b);
          summaryService.invalidateMonthlySummaryCache(TENANT_A);

          const fromA = await categoryService.listCategories(TENANT_A);
          const fromB = await categoryService.listCategories(TENANT_B);

          // A never sees B's categories and vice-versa
          expect(fromA.length).toBe(a);
          expect(fromB.length).toBe(b);
          const aIds = new Set(store.categories.filter((c) => c.tenant_id === TENANT_A).map((c) => c.id));
          const bIds = new Set(store.categories.filter((c) => c.tenant_id === TENANT_B).map((c) => c.id));
          expect(fromA.every((c) => aIds.has(c.id))).toBe(true);
          expect(fromA.every((c) => !bIds.has(c.id))).toBe(true);
          expect(fromB.every((c) => bIds.has(c.id))).toBe(true);
          expect(fromB.every((c) => !aIds.has(c.id))).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('getMenu only ever returns menu items of the requesting tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        fc.boolean(),
        async (a, b, showAll) => {
          seedBothTenants(a, b);

          const groupsA = await menuService.getMenu(TENANT_A, showAll);
          const namesA = groupsA.flatMap((g) => g.items.map((i) => i.id));

          const aItemIds = new Set(store.menu_items.filter((mi) => mi.tenant_id === TENANT_A).map((mi) => mi.id));
          const bItemIds = new Set(store.menu_items.filter((mi) => mi.tenant_id === TENANT_B).map((mi) => mi.id));

          // Every returned item belongs to A; none belongs to B.
          expect(namesA.every((id) => aItemIds.has(id))).toBe(true);
          expect(namesA.every((id) => !bItemIds.has(id))).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('listUsers / getUserById only ever return users of the requesting tenant', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 8 }),
        async (a, b) => {
          seedBothTenants(a, b);

          const fromA = await userService.listUsers(TENANT_A);
          const aUserIds = new Set(store.users.filter((u) => u.tenant_id === TENANT_A).map((u) => u.id));
          const bUserIds = new Set(store.users.filter((u) => u.tenant_id === TENANT_B).map((u) => u.id));

          expect(fromA.length).toBe(a);
          expect(fromA.every((u) => aUserIds.has(u.id))).toBe(true);
          expect(fromA.every((u) => !bUserIds.has(u.id))).toBe(true);

          // A request from A for one of B's users is treated as non-existent (→ 404).
          const someBUser = store.users.find((u) => u.tenant_id === TENANT_B)!;
          const crossed = await userService.getUserById(TENANT_A, someBUser.id as string);
          expect(crossed).toBeNull();

          // The same id fetched by B does resolve.
          const own = await userService.getUserById(TENANT_B, someBUser.id as string);
          expect(own?.id).toBe(someBUser.id);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('getDailySummary aggregates only the requesting tenant orders', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        async (a, b) => {
          seedBothTenants(Math.max(a, 1), Math.max(b, 1));
          // Rebuild orders precisely so counts are deterministic per tenant.
          store.orders = [];
          for (let i = 0; i < a; i++) store.orders.push(makeOrder(TENANT_A));
          for (let i = 0; i < b; i++) store.orders.push(makeOrder(TENANT_B));

          summaryService.invalidateMonthlySummaryCache(TENANT_A);
          summaryService.invalidateMonthlySummaryCache(TENANT_B);

          const summaryA = await summaryService.getDailySummary(TENANT_A, DATE);
          const summaryB = await summaryService.getDailySummary(TENANT_B, DATE);

          // Each tenant only counts its own orders — no cross-tenant contamination.
          expect(summaryA.totalOrders).toBe(a);
          expect(summaryB.totalOrders).toBe(b);
        },
      ),
      { numRuns: 60 },
    );
  });
});
