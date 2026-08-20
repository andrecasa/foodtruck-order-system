import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/tenant.middleware.js';

/**
 * Property 3: Unicidade case-insensitive rejeita com 409
 *
 * Para quaisquer dois itens de cardápio onde LOWER(nome1) === LOWER(nome2),
 * a criação do segundo item deve ser rejeitada com HTTP 409,
 * independente da combinação de maiúsculas/minúsculas.
 *
 * Feature: food-truck-order-system, Property 3: Unicidade case-insensitive rejeita com 409
 *
 * **Validates: Requirements 4.2**
 */

// Mock supabaseAdmin (still imported but not used for create/update)
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: { from: vi.fn() },
}));

// Mock pg Pool
const mockPoolQuery = vi.fn();
vi.mock('../../config/database.js', () => ({
  pool: {
    query: (...args: any[]) => mockPoolQuery(...args),
  },
}));

import { createMenuItem } from '../../controllers/menu.controller.js';

function mockRequest(body: any): Partial<AuthenticatedRequest> {
  return {
    body,
    params: {},
    user: { id: 'user-1', email: 'test@test.com' },
    // Tenant resolved by tenantMiddleware; required by the tenant-scoped services.
    tenantId: 'tenant-1',
  } as Partial<AuthenticatedRequest>;
}

function mockResponse(): { statusCode: number; body: any; status: (code: number) => any; json: (data: any) => any } {
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

/**
 * Generator: produces a random valid menu item name using Latin characters.
 */
function validMenuNameArb(): fc.Arbitrary<string> {
  const latinChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ0123456789'.split('');
  return fc.array(fc.constantFrom(...latinChars), { minLength: 1, maxLength: 50 })
    .map((chars) => chars.join(''))
    .filter((s) => s.trim().length > 0);
}

// --- Property Tests ---

describe('Property 3: Unicidade case-insensitive rejeita com 409', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('for any two names where LOWER(name1) === LOWER(name2), the second creation returns 409', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMenuNameArb(),
        fc.integer({ min: 1, max: 999999 }),
        async (baseName, price) => {
          vi.clearAllMocks();

          const variant = baseName
            .split('')
            .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
            .join('');

          expect(baseName.toLowerCase()).toBe(variant.toLowerCase());

          // Mock pool.query calls in order:
          // 1. Category lookup -> found
          mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] });
          // 2. Name uniqueness check -> collision found
          mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-item-1' }] });

          const req = mockRequest({ name: variant, price, category: 'Pastéis' });
          const res = mockResponse();

          await createMenuItem(req as AuthenticatedRequest, res as unknown as Response);

          expect(res.statusCode).toBe(409);
          expect(res.body.error).toBe('CONFLICT');
          expect(res.body.message).toBe('Item com este nome já existe');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('case transformations (uppercase, lowercase, mixed) are all recognized as duplicates', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMenuNameArb(),
        fc.constantFrom('upper', 'lower', 'alternating', 'random') as fc.Arbitrary<string>,
        fc.integer({ min: 1, max: 999999 }),
        async (baseName, transformType, price) => {
          vi.clearAllMocks();

          let transformed: string;
          switch (transformType) {
            case 'upper': transformed = baseName.toUpperCase(); break;
            case 'lower': transformed = baseName.toLowerCase(); break;
            case 'alternating':
              transformed = baseName.split('').map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase())).join('');
              break;
            default:
              transformed = baseName.split('').map((ch, i) => (i % 3 === 0 ? ch.toUpperCase() : ch.toLowerCase())).join('');
          }

          expect(baseName.toLowerCase()).toBe(transformed.toLowerCase());

          // 1. Category lookup -> found
          mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] });
          // 2. Name uniqueness -> collision
          mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-item-1' }] });

          const req = mockRequest({ name: transformed, price, category: 'Pastéis' });
          const res = mockResponse();

          await createMenuItem(req as AuthenticatedRequest, res as unknown as Response);

          expect(res.statusCode).toBe(409);
          expect(res.body.error).toBe('CONFLICT');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('pool.query is called with LOWER comparison for case-insensitive matching', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMenuNameArb(),
        fc.integer({ min: 1, max: 999999 }),
        async (name, price) => {
          vi.clearAllMocks();

          // 1. Category lookup -> found
          mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] });
          // 2. Name uniqueness -> no collision
          mockPoolQuery.mockResolvedValueOnce({ rows: [] });
          // 3. Insert -> success
          mockPoolQuery.mockResolvedValueOnce({
            rows: [{
              id: 'new-1', name, price_cents: price, status: 'ativo',
              created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
              category_id: 'cat-1',
            }],
          });
          // 4. Category name lookup
          mockPoolQuery.mockResolvedValueOnce({ rows: [{ name: 'Pastéis' }] });

          const req = mockRequest({ name, price, category: 'Pastéis' });
          const res = mockResponse();

          await createMenuItem(req as AuthenticatedRequest, res as unknown as Response);

          // Verify the uniqueness check query uses LOWER for case-insensitive
          // match. Via the TenantRepository, tenant_id is $1 and the caller
          // fragment placeholders are shifted by one, so LOWER(name) = LOWER($2).
          const uniquenessCall = mockPoolQuery.mock.calls[1];
          expect(uniquenessCall[0]).toContain('LOWER(name) = LOWER($2)');
          // params are [tenantId, name] — the name is still present.
          expect(uniquenessCall[1]).toContain(name);
        }
      ),
      { numRuns: 100 }
    );
  });
});
