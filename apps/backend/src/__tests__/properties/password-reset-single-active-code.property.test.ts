import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: forgot-password, Property 5: No máximo um código ativo por usuário/tenant
 *
 * Para qualquer usuário e tenant, após a geração de um novo Codigo_Verificacao,
 * todos os códigos anteriores ainda válidos desse mesmo (user_id, tenant_id)
 * devem ficar invalidados, restando no máximo um código ativo.
 *
 * **Validates: Requirements 3.5**
 *
 * O `password-reset-repository` acessa o `pool` de `config/database.ts`
 * diretamente (exceção arquitetural documentada no design). Aqui mockamos esse
 * pool com um store em memória de códigos e exercitamos o repositório REAL
 * (`invalidateActiveCodes` + `insertCode`) — o mesmo par de operações que o
 * serviço executa ao gerar um novo código. Verificamos que, após gerar o novo
 * código, os anteriores válidos do mesmo (user_id, tenant_id) ficam
 * invalidados (used_at != null), restando no máximo um código ativo.
 */

// --- In-memory fake pool ------------------------------------------------------
//
// Modela apenas a tabela `password_reset_codes` e as três formas de query que o
// repositório emite neste fluxo: o UPDATE de invalidação (invalidateActiveCodes)
// e o INSERT ... RETURNING (insertCode). Um código é "ativo" quando
// used_at IS NULL AND expires_at > NOW().

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

let store: CodeRow[];
let idCounter: number;

function param(params: unknown[], n: number): unknown {
  return params[n - 1];
}

/** A code is "active" (still valid) when not used/invalidated and not expired. */
function isActive(row: CodeRow, now: Date): boolean {
  return row.used_at === null && row.expires_at.getTime() > now.getTime();
}

function runQuery(sql: string, params: unknown[] = []): { rows: CodeRow[]; rowCount: number } {
  const now = new Date();

  // --- invalidateActiveCodes(userId, tenantId) ---
  // UPDATE ... SET used_at = NOW()
  //   WHERE user_id = $1 AND tenant_id = $2
  //     AND used_at IS NULL AND expires_at > NOW()
  if (/UPDATE\s+password_reset_codes/i.test(sql) && /SET\s+used_at\s*=\s*NOW\(\)/i.test(sql) && /user_id\s*=\s*\$1/i.test(sql)) {
    const userId = param(params, 1) as string;
    const tenantId = param(params, 2) as string;
    let affected = 0;
    for (const row of store) {
      if (
        row.user_id === userId &&
        row.tenant_id === tenantId &&
        row.used_at === null &&
        row.expires_at.getTime() > now.getTime()
      ) {
        row.used_at = now;
        affected += 1;
      }
    }
    return { rows: [], rowCount: affected };
  }

  // --- insertCode({ userId, tenantId, codeHash, expiresAt }) ---
  // INSERT INTO password_reset_codes (...) VALUES ($1,$2,$3,$4) RETURNING ...
  if (/INSERT\s+INTO\s+password_reset_codes/i.test(sql)) {
    idCounter += 1;
    const row: CodeRow = {
      id: `code-${idCounter}`,
      user_id: param(params, 1) as string,
      tenant_id: param(params, 2) as string,
      code_hash: param(params, 3) as string,
      expires_at: param(params, 4) as Date,
      used_at: null,
      attempts: 0,
      created_at: now,
    };
    store.push(row);
    return { rows: [{ ...row }], rowCount: 1 };
  }

  throw new Error(`Unhandled query in fake pool: ${sql}`);
}

vi.mock('../../config/database.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => Promise.resolve(runQuery(sql, params)),
    connect: vi.fn(),
  },
}));

import { passwordResetRepository } from '../../db/password-reset-repository.js';

// --- Generators ---------------------------------------------------------------

const uuidArb = fc.uuid();

/** Simulates generating a new code the way the service does it: first invalidate
 *  the still-valid codes of the (user, tenant), then insert the fresh one. */
async function generateCode(userId: string, tenantId: string): Promise<void> {
  await passwordResetRepository.invalidateActiveCodes(userId, tenantId);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await passwordResetRepository.insertCode({
    userId,
    tenantId,
    codeHash: `hash-${Math.random().toString(36).slice(2)}`,
    expiresAt,
  });
}

describe('Property 5: No máximo um código ativo por usuário/tenant', () => {
  beforeEach(() => {
    store = [];
    idCounter = 0;
  });

  it('after generating a new code, prior valid codes of the same (user, tenant) are invalidated (<= 1 active)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uuidArb,
        uuidArb,
        // number of codes generated in sequence for this (user, tenant)
        fc.integer({ min: 1, max: 12 }),
        async (userId, tenantId, generations) => {
          store = [];
          idCounter = 0;

          for (let i = 0; i < generations; i++) {
            await generateCode(userId, tenantId);
          }

          const now = new Date();
          const active = store.filter(
            (r) => r.user_id === userId && r.tenant_id === tenantId && isActive(r, now),
          );

          // At most one active code remains for this (user, tenant).
          expect(active.length).toBeLessThanOrEqual(1);
          // Exactly one, since each generation ends by inserting a fresh code.
          expect(active.length).toBe(1);
          // The single active code is the most recently inserted one.
          const newest = store[store.length - 1];
          expect(active[0].id).toBe(newest.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('invalidation is scoped: codes of other users/tenants stay active', async () => {
    await fc.assert(
      fc.asyncProperty(
        // target (user, tenant)
        uuidArb,
        uuidArb,
        // "other" identities that must NOT be affected
        fc.array(
          fc.record({ userId: uuidArb, tenantId: uuidArb }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.integer({ min: 2, max: 6 }),
        async (userId, tenantId, others, generations) => {
          store = [];
          idCounter = 0;

          // Seed one active code for each "other" identity that is distinct
          // from the target (user, tenant) pair.
          const seededOthers = others.filter(
            (o) => !(o.userId === userId && o.tenantId === tenantId),
          );
          for (const o of seededOthers) {
            await generateCode(o.userId, o.tenantId);
          }

          const activeOtherIdsBefore = store
            .filter((r) => !(r.user_id === userId && r.tenant_id === tenantId))
            .map((r) => r.id);

          // Generate several codes for the target (user, tenant).
          for (let i = 0; i < generations; i++) {
            await generateCode(userId, tenantId);
          }

          const now = new Date();

          // Target: exactly one active code.
          const targetActive = store.filter(
            (r) => r.user_id === userId && r.tenant_id === tenantId && isActive(r, now),
          );
          expect(targetActive.length).toBe(1);

          // Others: every previously-active "other" code is still active.
          for (const id of activeOtherIdsBefore) {
            const row = store.find((r) => r.id === id)!;
            expect(isActive(row, now)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
