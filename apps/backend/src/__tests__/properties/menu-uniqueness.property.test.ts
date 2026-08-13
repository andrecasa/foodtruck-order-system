import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

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

// --- Helpers ---

function createChain() {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return chain;
}

// Mock supabaseAdmin
vi.mock('../../config/supabase.js', () => ({
  supabase: { auth: { getUser: vi.fn() } },
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '../../config/supabase.js';
import { createMenuItem } from '../../controllers/menu.controller.js';

function mockRequest(body: any): Partial<AuthenticatedRequest> {
  return {
    body,
    params: {},
    user: { id: 'user-1', email: 'test@test.com' },
  };
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
 * Generator: produces a random valid menu item name using Latin characters
 * (letters, spaces, accents common in Portuguese menu items).
 * Constrained to characters where toUpperCase/toLowerCase is reversible.
 */
function validMenuNameArb(): fc.Arbitrary<string> {
  const latinChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ áàãâéêíóôõúçÁÀÃÂÉÊÍÓÔÕÚÇ0123456789'.split('');
  return fc.array(fc.constantFrom(...latinChars), { minLength: 1, maxLength: 50 })
    .map((chars) => chars.join(''))
    .filter((s) => s.trim().length > 0);
}

/**
 * Generates a case variant of the given string by randomly toggling
 * the case of each character.
 */
function caseVariantArb(base: string): fc.Arbitrary<string> {
  if (base.length === 0) return fc.constant(base);

  return fc.array(fc.boolean(), { minLength: base.length, maxLength: base.length }).map(
    (toggles) =>
      base
        .split('')
        .map((ch, i) => (toggles[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join('')
  );
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

          // Generate a case variant of baseName
          const variant = baseName
            .split('')
            .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
            .join('');

          // Verify the property precondition: they are case-insensitively equal
          expect(baseName.toLowerCase()).toBe(variant.toLowerCase());

          // Mock: category exists
          const catChain = createChain();
          catChain.single.mockResolvedValue({ data: { id: 'cat-1' }, error: null });
          catChain.eq.mockReturnValue(catChain);
          catChain.select.mockReturnValue(catChain);

          // Mock: name uniqueness check returns existing item (simulating first item already exists)
          const nameChain = createChain();
          nameChain.eq.mockResolvedValue({ data: [{ id: 'existing-item-1' }], error: null });
          nameChain.ilike.mockReturnValue(nameChain);
          nameChain.select.mockReturnValue(nameChain);

          vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
            if (table === 'categories') return catChain as any;
            if (table === 'menu_items') return nameChain as any;
            return createChain() as any;
          });

          // Attempt to create the second item with the case variant name
          const req = mockRequest({ name: variant, price, category: 'Pastéis' });
          const res = mockResponse();

          await createMenuItem(req as AuthenticatedRequest, res as unknown as Response);

          // The system must reject with 409
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

          // Apply different case transformations
          let transformed: string;
          switch (transformType) {
            case 'upper':
              transformed = baseName.toUpperCase();
              break;
            case 'lower':
              transformed = baseName.toLowerCase();
              break;
            case 'alternating':
              transformed = baseName
                .split('')
                .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
                .join('');
              break;
            case 'random':
              transformed = baseName
                .split('')
                .map((ch, i) => (i % 3 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
                .join('');
              break;
            default:
              transformed = baseName;
          }

          // Verify they are case-insensitively equal
          expect(baseName.toLowerCase()).toBe(transformed.toLowerCase());

          // Mock: category exists
          const catChain = createChain();
          catChain.single.mockResolvedValue({ data: { id: 'cat-1' }, error: null });
          catChain.eq.mockReturnValue(catChain);
          catChain.select.mockReturnValue(catChain);

          // Mock: ilike finds the existing item (simulates DB behavior)
          const nameChain = createChain();
          nameChain.eq.mockResolvedValue({ data: [{ id: 'existing-item-1' }], error: null });
          nameChain.ilike.mockReturnValue(nameChain);
          nameChain.select.mockReturnValue(nameChain);

          vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
            if (table === 'categories') return catChain as any;
            if (table === 'menu_items') return nameChain as any;
            return createChain() as any;
          });

          const req = mockRequest({ name: transformed, price, category: 'Pastéis' });
          const res = mockResponse();

          await createMenuItem(req as AuthenticatedRequest, res as unknown as Response);

          // Must always reject with 409
          expect(res.statusCode).toBe(409);
          expect(res.body.error).toBe('CONFLICT');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('ilike query is called with the exact name provided (enabling case-insensitive DB match)', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMenuNameArb(),
        fc.integer({ min: 1, max: 999999 }),
        async (name, price) => {
          vi.clearAllMocks();

          // Mock: category exists
          const catChain = createChain();
          catChain.single.mockResolvedValue({ data: { id: 'cat-1' }, error: null });
          catChain.eq.mockReturnValue(catChain);
          catChain.select.mockReturnValue(catChain);

          // Mock: no collision (allows us to check the call)
          const nameChain = createChain();
          nameChain.eq.mockResolvedValue({ data: [], error: null });
          nameChain.ilike.mockReturnValue(nameChain);
          nameChain.select.mockReturnValue(nameChain);

          // Mock: successful insert
          const insertChain = createChain();
          insertChain.single.mockResolvedValue({
            data: {
              id: 'new-1',
              name,
              price_cents: price,
              status: 'ativo',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              category_id: 'cat-1',
              categories: { name: 'Pastéis' },
            },
            error: null,
          });
          insertChain.select.mockReturnValue(insertChain);
          insertChain.insert.mockReturnValue(insertChain);

          let menuCallCount = 0;
          vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
            if (table === 'categories') return catChain as any;
            if (table === 'menu_items') {
              menuCallCount++;
              if (menuCallCount === 1) return nameChain as any;
              return insertChain as any;
            }
            return createChain() as any;
          });

          const req = mockRequest({ name, price, category: 'Pastéis' });
          const res = mockResponse();

          await createMenuItem(req as AuthenticatedRequest, res as unknown as Response);

          // Verify ilike was called with the name (case-insensitive matching mechanism)
          expect(nameChain.ilike).toHaveBeenCalledWith('name', name);
        }
      ),
      { numRuns: 100 }
    );
  });
});
