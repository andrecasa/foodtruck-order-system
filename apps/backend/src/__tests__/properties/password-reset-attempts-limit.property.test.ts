import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';
import {
  passwordResetRepository,
  type PasswordResetCodeRow,
} from '../../db/password-reset-repository.js';

/**
 * Feature: forgot-password, Property 6: Limite de tentativas invalida o código
 *
 * Para qualquer Codigo_Verificacao, ao atingir 5 tentativas incorretas de
 * validação, o código deve ser invalidado (used_at definido) e toda tentativa
 * subsequente deve ser recusada — findActiveCodeForEmail passa a retornar null.
 *
 * O repositório fala diretamente com o `pool`; aqui o pool é mockado com uma
 * loja de códigos em memória que reproduz a semântica dos dois statements SQL
 * relevantes: `registerFailedAttempt` (incrementa attempts; invalida ao chegar
 * a 5) e `findActiveCodeForEmail` (ativo = used_at IS NULL AND expires_at > NOW()
 * AND attempts < 5).
 *
 * **Validates: Requirements 3.6, 6.4**
 */

const MAX_ATTEMPTS = 5;

interface StoredCode {
  id: string;
  user_id: string;
  tenant_id: string;
  code_hash: string;
  expires_at: Date;
  used_at: Date | null;
  attempts: number;
  created_at: Date;
}

/**
 * Wires the mocked pool to an in-memory code store, reproducing the behavior of
 * the two SQL statements exercised by this property. Returns the store so the
 * test can seed and inspect it.
 */
function installInMemoryStore(email: string, code: StoredCode): Map<string, StoredCode> {
  const store = new Map<string, StoredCode>();
  store.set(code.id, code);

  vi.mocked(pool.query).mockImplementation(async (text: unknown, params?: unknown) => {
    const sql = String(text);
    const args = (params as unknown[]) ?? [];

    // registerFailedAttempt: UPDATE ... SET attempts = attempts + 1, used_at = CASE ...
    if (sql.includes('attempts = attempts + 1')) {
      const codeId = args[0] as string;
      const row = store.get(codeId);
      if (!row) {
        return { rows: [], command: 'UPDATE', rowCount: 0, oid: 0, fields: [] } as never;
      }
      row.attempts += 1;
      if (row.attempts >= MAX_ATTEMPTS && row.used_at === null) {
        row.used_at = new Date();
      }
      return {
        rows: [{ ...row }],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      } as never;
    }

    // findActiveCodeForEmail: SELECT ... JOIN users ... WHERE LOWER(u.email) = LOWER($1)
    if (sql.includes('FROM password_reset_codes c') && sql.includes('JOIN users')) {
      const now = new Date();
      const active = Array.from(store.values())
        .filter(
          (r) =>
            r.used_at === null &&
            r.expires_at.getTime() > now.getTime() &&
            r.attempts < MAX_ATTEMPTS,
        )
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
      const match = active.length > 0 ? active[0] : undefined;
      return {
        rows: match ? [{ ...match }] : [],
        command: 'SELECT',
        rowCount: match ? 1 : 0,
        oid: 0,
        fields: [],
      } as never;
    }

    return { rows: [], command: 'SELECT', rowCount: 0, oid: 0, fields: [] } as never;
  });

  return store;
}

describe('Feature: forgot-password, Property 6: Limite de tentativas invalida o código', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Generator: an active, non-expired, unused code with a starting attempts count
  // strictly below the limit, so it takes at least one more failed attempt to hit 5.
  const activeCodeArb = fc.record({
    id: fc.uuid(),
    userId: fc.uuid(),
    tenantId: fc.uuid(),
    startingAttempts: fc.integer({ min: 0, max: MAX_ATTEMPTS - 1 }),
  });

  it('após 5 tentativas incorretas o código é invalidado e as seguintes são recusadas', async () => {
    await fc.assert(
      fc.asyncProperty(activeCodeArb, async ({ id, userId, tenantId, startingAttempts }) => {
        vi.clearAllMocks();

        const email = 'user@example.com';
        const createdAt = new Date(Date.now() - 60_000);
        const expiresAt = new Date(Date.now() + 15 * 60_000);

        const store = installInMemoryStore(email, {
          id,
          user_id: userId,
          tenant_id: tenantId,
          code_hash: 'hash',
          expires_at: expiresAt,
          used_at: null,
          attempts: startingAttempts,
          created_at: createdAt,
        });

        // Before hitting the limit the code must still be findable as active.
        const beforeLimit = await passwordResetRepository.findActiveCodeForEmail(email);
        expect(beforeLimit).not.toBeNull();

        // Register failed attempts until reaching the limit of 5.
        const attemptsNeeded = MAX_ATTEMPTS - startingAttempts;
        let lastRow: PasswordResetCodeRow | null = null;
        for (let i = 0; i < attemptsNeeded; i++) {
          lastRow = await passwordResetRepository.registerFailedAttempt(id);
        }

        // Property: reaching 5 attempts invalidates the code (used_at set).
        expect(lastRow).not.toBeNull();
        expect((lastRow as PasswordResetCodeRow).attempts).toBeGreaterThanOrEqual(MAX_ATTEMPTS);
        expect((lastRow as PasswordResetCodeRow).used_at).not.toBeNull();
        expect(store.get(id)?.used_at).not.toBeNull();

        // Property: subsequent attempts are refused — no active code is returned.
        const afterLimit = await passwordResetRepository.findActiveCodeForEmail(email);
        expect(afterLimit).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('enquanto abaixo de 5 tentativas o código permanece ativo', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          id: fc.uuid(),
          userId: fc.uuid(),
          tenantId: fc.uuid(),
          // Perform between 1 and MAX_ATTEMPTS-1 failed attempts, staying below the limit.
          failedAttempts: fc.integer({ min: 1, max: MAX_ATTEMPTS - 1 }),
        }),
        async ({ id, userId, tenantId, failedAttempts }) => {
          vi.clearAllMocks();

          const email = 'user@example.com';
          const store = installInMemoryStore(email, {
            id,
            user_id: userId,
            tenant_id: tenantId,
            code_hash: 'hash',
            expires_at: new Date(Date.now() + 15 * 60_000),
            used_at: null,
            attempts: 0,
            created_at: new Date(),
          });

          let lastRow: PasswordResetCodeRow | null = null;
          for (let i = 0; i < failedAttempts; i++) {
            lastRow = await passwordResetRepository.registerFailedAttempt(id);
          }

          // Property: below the limit the code is NOT invalidated.
          expect((lastRow as PasswordResetCodeRow).attempts).toBe(failedAttempts);
          expect((lastRow as PasswordResetCodeRow).used_at).toBeNull();
          expect(store.get(id)?.used_at).toBeNull();

          // Property: the code remains findable as active.
          const active = await passwordResetRepository.findActiveCodeForEmail(email);
          expect(active).not.toBeNull();
          expect(active?.id).toBe(id);
        },
      ),
      { numRuns: 100 },
    );
  });
});
