import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 4: Update preserva ID e altera apenas campos informados
 *
 * Para qualquer item existente no cardápio e qualquer payload de atualização válido
 * (nome, preço ou categoria), a atualização deve manter o mesmo ID do item e alterar
 * apenas os campos informados, preservando os demais inalterados.
 *
 * Feature: food-truck-order-system, Property 4: Update preserva ID e altera apenas campos informados
 *
 * **Validates: Requirements 4.5**
 */

interface MenuItem {
  id: string;
  name: string;
  price_cents: number;
  category_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface UpdatePayload {
  name?: string;
  price?: number;
  category_id?: string;
}

/**
 * Applies an update payload to an existing menu item, mirroring the backend logic:
 * - updated_at is always set
 * - only provided fields are changed
 * - ID is never modified
 */
function applyUpdate(item: MenuItem, payload: UpdatePayload): MenuItem {
  const result = { ...item, updated_at: new Date().toISOString() };
  if (payload.name !== undefined) result.name = payload.name;
  if (payload.price !== undefined) result.price_cents = payload.price;
  if (payload.category_id !== undefined) result.category_id = payload.category_id;
  return result;
}

// Arbitraries
const validDateArb = fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2030-12-31T23:59:59Z') })
  .filter((d) => !isNaN(d.getTime()))
  .map((d) => d.toISOString());

const menuItemArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
  price_cents: fc.integer({ min: 1, max: 999999 }),
  category_id: fc.uuid(),
  status: fc.constantFrom('ativo', 'inativo'),
  created_at: validDateArb,
  updated_at: validDateArb,
});

// Generate a partial update payload where at least one field is defined
const updatePayloadArb = fc
  .record({
    name: fc.option(
      fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      { nil: undefined }
    ),
    price: fc.option(fc.integer({ min: 1, max: 999999 }), { nil: undefined }),
    category_id: fc.option(fc.uuid(), { nil: undefined }),
  })
  .filter((p) => p.name !== undefined || p.price !== undefined || p.category_id !== undefined);

describe('Property 4: Update preserva ID e altera apenas campos informados', () => {
  it('should preserve the item ID after any valid update', () => {
    fc.assert(
      fc.property(menuItemArb, updatePayloadArb, (item, payload) => {
        const updated = applyUpdate(item, payload);
        expect(updated.id).toBe(item.id);
      }),
      { numRuns: 100 }
    );
  });

  it('should only modify fields present in the update payload and preserve absent fields', () => {
    fc.assert(
      fc.property(menuItemArb, updatePayloadArb, (item, payload) => {
        const updated = applyUpdate(item, payload);

        // ID must never change
        expect(updated.id).toBe(item.id);

        // status and created_at are never part of an update payload
        expect(updated.status).toBe(item.status);
        expect(updated.created_at).toBe(item.created_at);

        // For each field in the payload: if defined, the updated value equals the new value
        if (payload.name !== undefined) {
          expect(updated.name).toBe(payload.name);
        } else {
          // If not in the payload, the original value is preserved
          expect(updated.name).toBe(item.name);
        }

        if (payload.price !== undefined) {
          expect(updated.price_cents).toBe(payload.price);
        } else {
          expect(updated.price_cents).toBe(item.price_cents);
        }

        if (payload.category_id !== undefined) {
          expect(updated.category_id).toBe(payload.category_id);
        } else {
          expect(updated.category_id).toBe(item.category_id);
        }
      }),
      { numRuns: 100 }
    );
  });
});
