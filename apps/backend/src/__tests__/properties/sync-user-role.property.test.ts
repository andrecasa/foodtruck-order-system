import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { syncUserMiddleware } from '../../middleware/sync-user.middleware.js';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import type { Response, NextFunction } from 'express';

// Mock do pool de banco, como nos demais testes de middleware.
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from '../../config/database.js';

const mockedPool = vi.mocked(pool);

/**
 * Property tests do `syncUserMiddleware` quanto à exposição do papel do usuário.
 *
 * O papel (`users.role`) é a autoridade para exibir/ocultar áreas restritas a
 * admin no cliente (ex.: itens de admin no DrawerMenu do mobile). Para isso, o
 * middleware deve anexar o papel real da linha em `users` a `req.user`, de modo
 * que a rota de sessão (`getSession`) o devolva ao cliente.
 *
 * Propriedade: para qualquer usuário provisionado, `req.user.role` após o
 * middleware é exatamente o papel retornado pelo banco.
 *
 * **Validates: Requirements 2.1, 4.1**
 */
describe('syncUserMiddleware: expõe o papel real em req.user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validUuid = fc.uuid();
  const roleArb = fc.constantFrom('admin', 'atendente', 'preparador' as const);

  it('anexa o role da linha provisionada a req.user', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, validUuid, roleArb, async (id, tenantId, role) => {
        mockedPool.query.mockReset();
        mockedPool.query.mockResolvedValue({
          rows: [{ id, tenant_id: tenantId, role }],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as any);

        const req = { user: { id, email: 'user@example.com' } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        expect(req.user?.role).toBe(role);
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });

  it('não define role quando o usuário não está provisionado', async () => {
    await fc.assert(
      fc.asyncProperty(validUuid, async (id) => {
        mockedPool.query.mockReset();
        mockedPool.query.mockResolvedValue({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        } as any);

        const req = { user: { id, email: 'user@example.com' } } as AuthenticatedRequest;
        const res = {} as Response;
        const next: NextFunction = vi.fn();

        await syncUserMiddleware(req, res, next);

        expect(req.user?.role).toBeUndefined();
        expect(next).toHaveBeenCalled();
      }),
      { numRuns: 50 },
    );
  });
});
