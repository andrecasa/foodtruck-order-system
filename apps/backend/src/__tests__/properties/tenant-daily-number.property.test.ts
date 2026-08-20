import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: multi-tenant-white-label, Correctness Property 4:
 * Numeração diária monotônica e isolada (R3)
 *
 * Para um tenant T e data D, os `daily_number` atribuídos formam a sequência
 * 1,2,3,… sem duplicatas nem lacunas causadas por concorrência; a sequência de T
 * é independente da de qualquer outro tenant na mesma data.
 *
 * Esta é a versão *tenant-aware* da numeração diária: o escopo do contador passa a
 * ser o par (tenant_id, order_date), refletindo a função SQL:
 *
 *   INSERT INTO daily_sequences (tenant_id, order_date, last_number)
 *   VALUES (p_tenant_id, p_date, 1)
 *   ON CONFLICT (tenant_id, order_date)
 *   DO UPDATE SET last_number = daily_sequences.last_number + 1
 *   RETURNING last_number
 *
 * **Validates: Requirements 3.2, 3.5, 3.6, 3.7**
 */
describe('Property 4: Numeração diária monotônica e isolada por tenant', () => {
  /**
   * Simulates the tenant-scoped next_daily_number PostgreSQL function.
   * The counter state is keyed by (tenant_id, order_date), mirroring the
   * composite primary key (tenant_id, order_date) of daily_sequences and the
   * ON CONFLICT (tenant_id, order_date) upsert. Each call returns the next
   * sequential number for that exact (tenant, date) pair, starting at 1.
   *
   * Because each call is a single atomic upsert-returning in the database,
   * modelling concurrent creations as a serialized sequence of calls is a
   * faithful abstraction: the DB serializes conflicting upserts on the same
   * (tenant_id, order_date) row, so the returned numbers are always a
   * gap-free, duplicate-free sequence regardless of interleaving.
   */
  function key(tenantId: string, date: string): string {
    return `${tenantId}\u0000${date}`;
  }

  function nextDailyNumber(
    state: Map<string, number>,
    tenantId: string,
    date: string
  ): number {
    const k = key(tenantId, date);
    const current = state.get(k) ?? 0;
    const next = current + 1;
    state.set(k, next);
    return next;
  }

  // Generator: tenant id (UUID-like distinct identifiers)
  const tenantIdArb = fc.uuid();

  // Generator: date string in yyyy-MM-dd format
  const dateArb = fc
    .record({
      year: fc.integer({ min: 2020, max: 2030 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
    })
    .map(
      ({ year, month, day }) =>
        `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    );

  // Generator: two distinct tenant ids
  const twoTenantsArb = fc
    .tuple(tenantIdArb, tenantIdArb)
    .filter(([a, b]) => a !== b);

  // Generator: two distinct dates
  const twoDatesArb = fc.tuple(dateArb, dateArb).filter(([a, b]) => a !== b);

  // R3.4, R3.2: for N orders of one tenant on one date, numbers are [1..N]
  it('for N orders of a tenant on a date, daily_numbers form [1..N] without gaps', () => {
    fc.assert(
      fc.property(
        tenantIdArb,
        dateArb,
        fc.integer({ min: 1, max: 100 }),
        (tenantId, date, numOrders) => {
          const state = new Map<string, number>();
          const assigned: number[] = [];

          for (let i = 0; i < numOrders; i++) {
            assigned.push(nextDailyNumber(state, tenantId, date));
          }

          const expected = Array.from({ length: numOrders }, (_, i) => i + 1);
          expect(assigned).toEqual(expected);
        }
      ),
      { numRuns: 200 }
    );
  });

  // R3.5: two tenants on the same date keep independent counters
  it('two tenants on the same date keep independent, non-interfering counters', () => {
    fc.assert(
      fc.property(
        twoTenantsArb,
        dateArb,
        // interleaving of which tenant creates the next order: true = A, false = B
        fc.array(fc.boolean(), { minLength: 1, maxLength: 100 }),
        ([tenantA, tenantB], date, interleaving) => {
          const state = new Map<string, number>();
          const numbersA: number[] = [];
          const numbersB: number[] = [];

          for (const toA of interleaving) {
            if (toA) {
              numbersA.push(nextDailyNumber(state, tenantA, date));
            } else {
              numbersB.push(nextDailyNumber(state, tenantB, date));
            }
          }

          // Each tenant's numbers are an independent gap-free [1..N] sequence,
          // unaffected by the other tenant's activity on the same date.
          const expectedA = Array.from({ length: numbersA.length }, (_, i) => i + 1);
          const expectedB = Array.from({ length: numbersB.length }, (_, i) => i + 1);
          expect(numbersA).toEqual(expectedA);
          expect(numbersB).toEqual(expectedB);
        }
      ),
      { numRuns: 200 }
    );
  });

  // R3.6: numbering restarts at 1 on a new date for the same tenant
  it('numbering restarts at 1 for a new date within the same tenant', () => {
    fc.assert(
      fc.property(
        tenantIdArb,
        twoDatesArb,
        fc.integer({ min: 1, max: 50 }),
        (tenantId, [date1, date2], ordersDay1) => {
          const state = new Map<string, number>();

          for (let i = 0; i < ordersDay1; i++) {
            nextDailyNumber(state, tenantId, date1);
          }

          const firstOnNewDate = nextDailyNumber(state, tenantId, date2);
          expect(firstOnNewDate).toBe(1);
        }
      ),
      { numRuns: 200 }
    );
  });

  // R3.7: under concurrency (interleaved creations across tenants and dates),
  // each (tenant, date) sequence is unique and consecutive without gaps
  it('interleaved concurrent creations yield unique, consecutive numbers per (tenant, date)', () => {
    // An event is a creation for some tenant on some date
    const eventArb = fc.record({ tenantId: tenantIdArb, date: dateArb });

    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 1, maxLength: 200 }),
        (events) => {
          const state = new Map<string, number>();
          const numbersByKey = new Map<string, number[]>();

          for (const { tenantId, date } of events) {
            const num = nextDailyNumber(state, tenantId, date);
            const k = key(tenantId, date);
            const list = numbersByKey.get(k) ?? [];
            list.push(num);
            numbersByKey.set(k, list);
          }

          for (const numbers of numbersByKey.values()) {
            // No duplicates under concurrency
            expect(new Set(numbers).size).toBe(numbers.length);
            // No gaps: exactly [1..N] in assignment order
            const expected = Array.from({ length: numbers.length }, (_, i) => i + 1);
            expect(numbers).toEqual(expected);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  // R3.5 (cross-check): the same date shared by many tenants never bleeds counts
  it('a tenants sequence is independent of the number of other tenants on the same date', () => {
    fc.assert(
      fc.property(
        tenantIdArb,
        dateArb,
        fc.integer({ min: 1, max: 30 }), // orders for the tenant under test
        fc.array(tenantIdArb, { minLength: 0, maxLength: 20 }), // other tenants
        (tenantId, date, myOrders, otherTenants) => {
          const state = new Map<string, number>();

          // Other tenants create arbitrary noise on the same date first
          for (const other of otherTenants) {
            if (other === tenantId) continue;
            nextDailyNumber(state, other, date);
          }

          // The tenant under test still starts at 1 and increments by 1
          const assigned: number[] = [];
          for (let i = 0; i < myOrders; i++) {
            assigned.push(nextDailyNumber(state, tenantId, date));
          }

          const expected = Array.from({ length: myOrders }, (_, i) => i + 1);
          expect(assigned).toEqual(expected);
        }
      ),
      { numRuns: 200 }
    );
  });
});
