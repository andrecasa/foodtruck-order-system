import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// O serviço transitivamente carrega o cliente Supabase (requer credenciais no
// load) e o pool de banco. Mockamos ambos: este teste injeta um repositório e
// um serviço de e-mail falsos via `deps`, então os módulos reais de infra não
// devem ser exercitados.
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { auth: { admin: { updateUserById: vi.fn(), signOut: vi.fn() } } },
}));

vi.mock('../../config/database.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

/**
 * Feature: forgot-password, Property 4: Geração de código bem-formado
 *
 * Para qualquer geração de Codigo_Verificacao, o código produzido deve casar
 * exatamente com `^[0-9]{6}$` (6 dígitos, com zeros à esquerda permitidos), o
 * valor persistido deve ser o hash do código (nunca o texto puro) e
 * `expires_at` deve ser exatamente 15 minutos após `created_at`.
 *
 * **Validates: Requirements 2.4, 3.1, 3.3, 3.4**
 *
 * Abordagem: exercitamos o serviço REAL. `generateCode`/`hashCode` são testados
 * diretamente. Para o comportamento de persistência de `requestCode`, injetamos
 * um repositório e um serviço de e-mail falsos (via o parâmetro `deps`) — sem
 * tocar o `pool` nem o provedor real. O e-mail falso captura o código em texto
 * puro entregue ao envio; o repositório falso captura o input de `insertCode`.
 * Assim verificamos que o valor persistido (`codeHash`) é `hashCode(code)` e
 * nunca o texto puro, e que `expiresAt` fica ~15 min após "agora".
 */

import {
  generateCode,
  hashCode,
  requestCode,
  CODE_TTL_MINUTES,
  type RequestCodeDeps,
} from '../../services/password-reset.service.js';
import type {
  ActiveUser,
  PasswordResetCodeRow,
  PasswordResetRepository,
} from '../../db/password-reset-repository.js';
import type { EmailService } from '../../services/email/email.service.js';

const CODE_REGEX = /^[0-9]{6}$/;
const CODE_TTL_MS = CODE_TTL_MINUTES * 60 * 1_000;

// --- Geradores ----------------------------------------------------------------

const emailArb = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,20}$/),
    fc.constantFrom('example.com', 'test.org', 'mail.dev', 'pastel.com.br'),
  )
  .map(([local, domain]) => `${local}@${domain}`);

// --- Test doubles -------------------------------------------------------------

interface InsertCall {
  userId: string;
  tenantId: string;
  codeHash: string;
  expiresAt: Date;
}

/**
 * Constrói um repositório falso que retorna um único usuário `ativo` para o
 * e-mail informado e captura toda chamada a `insertCode`. As demais operações
 * são no-ops suficientes para o fluxo de `requestCode`.
 */
function buildFakeRepository(user: ActiveUser, insertCalls: InsertCall[]): PasswordResetRepository {
  let idCounter = 0;
  return {
    findUsersByEmail: async () => [user],
    invalidateActiveCodes: async () => {},
    insertCode: async (input) => {
      insertCalls.push({ ...input });
      idCounter += 1;
      const row: PasswordResetCodeRow = {
        id: `code-${idCounter}`,
        user_id: input.userId,
        tenant_id: input.tenantId,
        code_hash: input.codeHash,
        expires_at: input.expiresAt,
        used_at: null,
        attempts: 0,
        created_at: new Date(),
      };
      return row;
    },
    findActiveCodeForEmail: async () => null,
    registerFailedAttempt: async () => {
      throw new Error('not used in this property');
    },
    markUsed: async () => {},
    invalidateCode: async () => {},
  };
}

/**
 * Constrói um serviço de e-mail falso que captura o código em texto puro
 * entregue ao envio. Não dispara retry nem toca timers.
 */
function buildFakeEmailService(sentCodes: string[]): EmailService {
  return {
    sendVerificationCode: (params) => {
      sentCodes.push(params.code);
      // Fire-and-forget bem-sucedido: não invoca onAllAttemptsFailed.
    },
  };
}

// --- Tests --------------------------------------------------------------------

describe('Feature: forgot-password, Property 4: Geração de código bem-formado', () => {
  it('generateCode produz exatamente 6 dígitos (^[0-9]{6}$), com zeros à esquerda permitidos', () => {
    fc.assert(
      fc.property(fc.integer(), () => {
        const code = generateCode();
        expect(code).toMatch(CODE_REGEX);
        expect(code).toHaveLength(6);
      }),
      { numRuns: 100 },
    );
  });

  it('hashCode(code) nunca é igual ao texto puro e é determinístico', () => {
    const codeArb = fc
      .integer({ min: 0, max: 999_999 })
      .map((n) => n.toString().padStart(6, '0'));

    fc.assert(
      fc.property(codeArb, (code) => {
        const hash = hashCode(code);
        // O hash nunca é o texto puro (R3.4).
        expect(hash).not.toBe(code);
        // O hash é uma string não-vazia (sha256 hex = 64 chars).
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        // Determinístico: mesmo código → mesmo hash.
        expect(hashCode(code)).toBe(hash);
      }),
      { numRuns: 100 },
    );
  });

  it('requestCode persiste o HASH (não o texto puro) e expires_at ~= agora + 15 min', async () => {
    await fc.assert(
      fc.asyncProperty(emailArb, fc.uuid(), fc.uuid(), async (email, userId, tenantId) => {
        const insertCalls: InsertCall[] = [];
        const sentCodes: string[] = [];

        const user: ActiveUser = {
          id: userId,
          tenant_id: tenantId,
          email,
          status: 'ativo',
        };

        const deps: RequestCodeDeps = {
          repository: buildFakeRepository(user, insertCalls),
          email: buildFakeEmailService(sentCodes),
        };

        const before = Date.now();
        await requestCode(email, deps);
        const after = Date.now();

        // Exatamente um código gerado e um insert para o usuário ativo.
        expect(insertCalls).toHaveLength(1);
        expect(sentCodes).toHaveLength(1);

        const inserted = insertCalls[0];
        const plaintextCode = sentCodes[0];

        // O código em texto puro (o que vai para o e-mail) é bem-formado.
        expect(plaintextCode).toMatch(CODE_REGEX);

        // O valor persistido é o hash do código, nunca o texto puro (R3.4).
        expect(inserted.codeHash).toBe(hashCode(plaintextCode));
        expect(inserted.codeHash).not.toBe(plaintextCode);

        // Escopo correto do código persistido.
        expect(inserted.userId).toBe(userId);
        expect(inserted.tenantId).toBe(tenantId);

        // expires_at é ~15 min após "agora" (R2.4/R3.3). Tolerância p/ o intervalo
        // decorrido entre a captura de `before` e a construção de `expiresAt`.
        const expiresMs = inserted.expiresAt.getTime();
        expect(expiresMs).toBeGreaterThanOrEqual(before + CODE_TTL_MS);
        expect(expiresMs).toBeLessThanOrEqual(after + CODE_TTL_MS);
      }),
      { numRuns: 100 },
    );
  });
});
