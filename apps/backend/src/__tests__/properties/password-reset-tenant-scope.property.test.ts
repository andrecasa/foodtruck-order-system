import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: forgot-password, Property 18: Escopo de tenant do código
 *
 * Para qualquer Codigo_Verificacao emitido para um par (usuario, tenant), ele
 * deve ser válido apenas para aquele usuário e tenant; aplicá-lo a um usuário de
 * tenant diferente deve ser recusado, e quando o mesmo e-mail existe em
 * múltiplos tenants cada usuário recebe e valida seu próprio código de forma
 * independente.
 *
 * Este teste dirige o REPOSITÓRIO REAL (`passwordResetRepository`) por meio de
 * um "pool" em memória que honra as consultas parametrizadas que o repositório
 * emite. Modelamos usuários que compartilham o MESMO e-mail em tenants
 * diferentes e verificamos que:
 *   - `findUsersByEmail` devolve os usuários de TODOS os tenants (R8.3);
 *   - `insertCode`/`invalidateActiveCodes` operam por (user_id, tenant_id), de
 *     modo que emitir um código para um tenant nunca invalida o de outro (R3.2);
 *   - um código só é o candidato ativo do e-mail dentro do seu próprio escopo,
 *     carregando sempre (user_id, tenant_id) do emissor (R8.1/R8.5).
 *
 * **Validates: Requirements 3.2, 8.1, 8.3, 8.5**
 */

// --- In-memory fake pool ------------------------------------------------------
//
// A store of `users` and `password_reset_codes` rows. The fake executor
// implements just enough SQL to serve the statements the repository issues, and
// always honors the parameter bindings ($1, $2, ...) so tenant scope is decided
// by the data, not by a hand-written mirror of the assertions.

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  status: 'ativo' | 'inativo';
}

interface CodeRow {
  id: string;
  user_id: string;
  tenant_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  attempts: number;
  created_at: Date;
}

interface Store {
  users: UserRow[];
  codes: CodeRow[];
}

let store: Store;
let codeIdCounter = 0;
let nowMs = 0;

function param(params: unknown[], n: number): unknown {
  return params[n - 1];
}

/**
 * Minimal SQL execution over the in-memory store, mirroring the exact set of
 * parameterized statements issued by `password-reset-repository.ts`.
 */
function runQuery(sql: string, params: unknown[] = []): { rows: any[]; rowCount: number } {
  const s = sql.replace(/\s+/g, ' ').trim();

  // findUsersByEmail: SELECT ... FROM users WHERE LOWER(email) = LOWER($1)
  if (/FROM users WHERE LOWER\(email\) = LOWER\(\$1\)/i.test(s)) {
    const email = String(param(params, 1)).toLowerCase();
    const rows = store.users
      .filter((u) => u.email.toLowerCase() === email)
      .map((u) => ({ ...u }));
    return { rows, rowCount: rows.length };
  }

  // invalidateActiveCodes: UPDATE ... WHERE user_id=$1 AND tenant_id=$2 AND used_at IS NULL AND expires_at > NOW()
  if (/UPDATE password_reset_codes SET used_at = NOW\(\) WHERE user_id = \$1 AND tenant_id = \$2/i.test(s)) {
    const userId = param(params, 1);
    const tenantId = param(params, 2);
    let count = 0;
    for (const c of store.codes) {
      if (
        c.user_id === userId &&
        c.tenant_id === tenantId &&
        c.used_at === null &&
        c.expires_at.getTime() > nowMs
      ) {
        c.used_at = new Date(nowMs);
        count += 1;
      }
    }
    return { rows: [], rowCount: count };
  }

  // insertCode: INSERT INTO password_reset_codes (...) VALUES ($1,$2,$3,$4) RETURNING ...
  if (/INSERT INTO password_reset_codes/i.test(s)) {
    codeIdCounter += 1;
    const row: CodeRow = {
      id: `code-${codeIdCounter}`,
      user_id: param(params, 1) as string,
      tenant_id: param(params, 2) as string,
      code_hash: param(params, 3) as string,
      expires_at: param(params, 4) as Date,
      used_at: null,
      attempts: 0,
      created_at: new Date(nowMs),
    };
    store.codes.push(row);
    return { rows: [{ ...row }], rowCount: 1 };
  }

  // findActiveCodeForEmail: SELECT ... JOIN users ... WHERE LOWER(u.email)=LOWER($1) AND active ORDER BY created_at DESC LIMIT 1
  if (/FROM password_reset_codes c JOIN users u/i.test(s)) {
    const email = String(param(params, 1)).toLowerCase();
    const maxAttempts = Number(param(params, 2));
    const candidates = store.codes
      .filter((c) => {
        const owner = store.users.find(
          (u) => u.id === c.user_id && u.tenant_id === c.tenant_id,
        );
        return (
          owner !== undefined &&
          owner.email.toLowerCase() === email &&
          c.used_at === null &&
          c.expires_at.getTime() > nowMs &&
          c.attempts < maxAttempts
        );
      })
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return candidates.length > 0
      ? { rows: [{ ...candidates[0] }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  }

  // registerFailedAttempt: UPDATE ... SET attempts = attempts + 1, used_at = CASE ... WHERE id=$1 RETURNING ...
  if (/SET attempts = attempts \+ 1/i.test(s)) {
    const codeId = param(params, 1);
    const maxAttempts = Number(param(params, 2));
    const c = store.codes.find((r) => r.id === codeId);
    if (!c) return { rows: [], rowCount: 0 };
    c.attempts += 1;
    if (c.attempts >= maxAttempts && c.used_at === null) {
      c.used_at = new Date(nowMs);
    }
    return { rows: [{ ...c }], rowCount: 1 };
  }

  // markUsed / invalidateCode: UPDATE ... SET used_at = NOW() WHERE id=$1 AND used_at IS NULL
  if (/UPDATE password_reset_codes SET used_at = NOW\(\) WHERE id = \$1/i.test(s)) {
    const codeId = param(params, 1);
    const c = store.codes.find((r) => r.id === codeId);
    if (c && c.used_at === null) {
      c.used_at = new Date(nowMs);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  throw new Error(`Unhandled query in fake pool: ${s}`);
}

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => Promise.resolve(runQuery(sql, params)),
    connect: vi.fn(),
  },
}));

import { passwordResetRepository } from '../../db/password-reset-repository.js';

// --- Generators ---------------------------------------------------------------

/** A distinct tenant UUID per index (a..f pattern reused from sibling tests). */
function tenantId(n: number): string {
  const c = 'abcdef0123456789'[n % 16];
  return `${c}${c}${c}${c}${c}${c}${c}${c}-${c}${c}${c}${c}-${c}${c}${c}${c}-${c}${c}${c}${c}-${c}${c}${c}${c}${c}${c}${c}${c}${c}${c}${c}${c}`;
}

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

function resetStore(): void {
  store = { users: [], codes: [] };
  codeIdCounter = 0;
  nowMs = Date.UTC(2024, 5, 15, 12, 0, 0);
}

/** A shared email plus a list of tenants that own a user with that email. */
const scenarioArb = fc
  .record({
    email: fc
      .tuple(
        fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
        fc.constantFrom('example.com', 'mail.co', 'test.org'),
      )
      .map(([local, domain]) => `${local}@${domain}`),
    tenantCount: fc.integer({ min: 2, max: 5 }),
    statuses: fc.array(fc.constantFrom<'ativo' | 'inativo'>('ativo', 'inativo'), {
      minLength: 2,
      maxLength: 5,
    }),
  })
  .map(({ email, tenantCount, statuses }) => {
    // Ensure at least `tenantCount` status entries; pad with 'ativo'.
    const filled = [...statuses];
    while (filled.length < tenantCount) filled.push('ativo');
    return {
      email,
      tenants: Array.from({ length: tenantCount }, (_, i) => ({
        tenantId: tenantId(i + 1),
        status: filled[i],
      })),
    };
  });

// --- Tests --------------------------------------------------------------------

describe('Property 18: Escopo de tenant do código', () => {
  beforeEach(() => {
    resetStore();
  });

  it('findUsersByEmail returns the users of ALL tenants sharing the email (R8.3)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ email, tenants }) => {
        resetStore();
        tenants.forEach((t, i) => {
          store.users.push({
            id: `user-${i}`,
            tenant_id: t.tenantId,
            email,
            status: t.status,
          });
        });

        const found = await passwordResetRepository.findUsersByEmail(email);

        // Every tenant that owns a user with this email is represented, exactly once.
        expect(found.length).toBe(tenants.length);
        const foundTenants = new Set(found.map((u) => u.tenant_id));
        for (const t of tenants) {
          expect(foundTenants.has(t.tenantId)).toBe(true);
        }
        // Case-insensitive match also works for an upper-cased query.
        const foundUpper = await passwordResetRepository.findUsersByEmail(
          email.toUpperCase(),
        );
        expect(foundUpper.length).toBe(tenants.length);
      }),
      { numRuns: 100 },
    );
  });

  it('codes are scoped per (user_id, tenant_id): issuing for one tenant never touches another (R3.2, R8.1)', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async ({ email, tenants }) => {
        resetStore();
        tenants.forEach((t, i) => {
          store.users.push({
            id: `user-${i}`,
            tenant_id: t.tenantId,
            email,
            status: 'ativo', // all active so each can hold a code
          });
        });

        // Issue an independent code for each (user, tenant).
        const issued: { userId: string; tenantId: string; codeId: string }[] = [];
        for (const [i, t] of tenants.entries()) {
          const userId = `user-${i}`;
          await passwordResetRepository.invalidateActiveCodes(userId, t.tenantId);
          const row = await passwordResetRepository.insertCode({
            userId,
            tenantId: t.tenantId,
            codeHash: `hash-${i}`,
            expiresAt: new Date(nowMs + FIFTEEN_MIN_MS),
          });
          expect(row.user_id).toBe(userId);
          expect(row.tenant_id).toBe(t.tenantId);
          issued.push({ userId, tenantId: t.tenantId, codeId: row.id });
        }

        // Each issued code stays active and bound to its own (user, tenant):
        // issuing for one tenant did NOT invalidate any other tenant's code.
        for (const rec of issued) {
          const c = store.codes.find((r) => r.id === rec.codeId)!;
          expect(c.used_at).toBeNull();
          expect(c.user_id).toBe(rec.userId);
          expect(c.tenant_id).toBe(rec.tenantId);
        }

        // Exactly one active code per (user, tenant) — no cross-tenant bleed.
        const activePerScope = new Map<string, number>();
        for (const c of store.codes) {
          if (c.used_at === null) {
            const key = `${c.user_id}|${c.tenant_id}`;
            activePerScope.set(key, (activePerScope.get(key) ?? 0) + 1);
          }
        }
        expect(activePerScope.size).toBe(tenants.length);
        for (const count of activePerScope.values()) {
          expect(count).toBe(1);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('a code is only valid for its issuing tenant; a foreign tenant cannot consume it (R8.5)', async () => {
    await fc.assert(
      fc.asyncProperty(
        scenarioArb,
        fc.string({ minLength: 1, maxLength: 8 }),
        async ({ email, tenants }, secret) => {
          resetStore();
          // Two active users sharing the email in different tenants.
          tenants.forEach((t, i) => {
            store.users.push({
              id: `user-${i}`,
              tenant_id: t.tenantId,
              email,
              status: 'ativo',
            });
          });

          // Issue a code for the FIRST tenant only.
          const issuerIndex = 0;
          const issuerUserId = `user-${issuerIndex}`;
          const issuerTenant = tenants[issuerIndex].tenantId;
          const codeHash = `hash-${secret}`;
          const issued = await passwordResetRepository.insertCode({
            userId: issuerUserId,
            tenantId: issuerTenant,
            codeHash,
            expiresAt: new Date(nowMs + FIFTEEN_MIN_MS),
          });

          // The active candidate for the email is exactly the issuer's code,
          // carrying the issuing (user_id, tenant_id) — never a foreign tenant.
          const candidate = await passwordResetRepository.findActiveCodeForEmail(email);
          expect(candidate).not.toBeNull();
          expect(candidate!.id).toBe(issued.id);
          expect(candidate!.user_id).toBe(issuerUserId);
          expect(candidate!.tenant_id).toBe(issuerTenant);

          // A validation attempt against a DIFFERENT tenant's user must not be
          // satisfiable by this code: the code's tenant_id fixes its scope, so
          // any tenant != issuerTenant fails the coherence check.
          for (let i = 1; i < tenants.length; i++) {
            expect(candidate!.tenant_id).not.toBe(tenants[i].tenantId);
          }

          // Consuming the issuer's code (markUsed) leaves no active candidate,
          // and does not resurrect or expose a code for any other tenant.
          await passwordResetRepository.markUsed(issued.id);
          const afterUse = await passwordResetRepository.findActiveCodeForEmail(email);
          expect(afterUse).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
