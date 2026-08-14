import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { updateOrderItemsRequestSchema } from '@order-system/shared';

/**
 * Feature: edit-order, Property 3: Schema Validation Rejects Invalid Inputs
 *
 * For any items array that violates at least one of:
 * (a) length < 1, (b) length > 50, (c) any item with quantity < 1 or > 99,
 * (d) any item with a non-UUID menuItemId, or (e) duplicate menuItemIds,
 * the updateOrderItemsRequestSchema SHALL reject the input (return success: false).
 *
 * **Validates: Requirements 1.3, 1.6, 1.8**
 */
describe('Property 3: Schema Validation Rejects Invalid Inputs', () => {
  // Helper: valid UUID generator
  const validUuid = fc.uuid();

  // Helper: valid quantity (1-99)
  const validQuantity = fc.integer({ min: 1, max: 99 });

  // Helper: valid order item
  const validOrderItem = fc.record({
    menuItemId: validUuid,
    quantity: validQuantity,
  });

  it('rejects empty items array (length < 1)', () => {
    fc.assert(
      fc.property(fc.constant([]), (items) => {
        const result = updateOrderItemsRequestSchema.safeParse({ items });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items array exceeding 50 items (length > 50)', () => {
    // Generate arrays with length between 51 and 80
    const tooManyItems = fc.array(validOrderItem, { minLength: 51, maxLength: 80 });

    fc.assert(
      fc.property(tooManyItems, (items) => {
        const result = updateOrderItemsRequestSchema.safeParse({ items });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items with quantity < 1', () => {
    // Generate a quantity that is less than 1 (0 or negative)
    const invalidQuantity = fc.integer({ min: -1000, max: 0 });

    const invalidItem = fc.record({
      menuItemId: validUuid,
      quantity: invalidQuantity,
    });

    // At least one invalid item surrounded by valid items
    const itemsWithInvalidQuantity = fc
      .tuple(
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 }),
        invalidItem,
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 })
      )
      .map(([before, invalid, after]) => [...before, invalid, ...after]);

    fc.assert(
      fc.property(itemsWithInvalidQuantity, (items) => {
        const result = updateOrderItemsRequestSchema.safeParse({ items });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items with quantity > 99', () => {
    // Generate a quantity that exceeds 99
    const invalidQuantity = fc.integer({ min: 100, max: 10000 });

    const invalidItem = fc.record({
      menuItemId: validUuid,
      quantity: invalidQuantity,
    });

    // At least one invalid item surrounded by valid items
    const itemsWithInvalidQuantity = fc
      .tuple(
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 }),
        invalidItem,
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 })
      )
      .map(([before, invalid, after]) => [...before, invalid, ...after]);

    fc.assert(
      fc.property(itemsWithInvalidQuantity, (items) => {
        const result = updateOrderItemsRequestSchema.safeParse({ items });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items with non-UUID menuItemId', () => {
    // Generate strings that are not valid UUIDs
    const nonUuidString = fc
      .string({ minLength: 1, maxLength: 50 })
      .filter((s) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s));

    const invalidItem = fc.record({
      menuItemId: nonUuidString,
      quantity: validQuantity,
    });

    // At least one invalid item surrounded by valid items
    const itemsWithInvalidMenuItemId = fc
      .tuple(
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 }),
        invalidItem,
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 })
      )
      .map(([before, invalid, after]) => [...before, invalid, ...after]);

    fc.assert(
      fc.property(itemsWithInvalidMenuItemId, (items) => {
        const result = updateOrderItemsRequestSchema.safeParse({ items });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('rejects items with duplicate menuItemIds', () => {
    // Generate a valid item and duplicate its menuItemId
    const itemsWithDuplicates = fc
      .tuple(
        validUuid,
        validQuantity,
        validQuantity,
        fc.array(validOrderItem, { minLength: 0, maxLength: 5 })
      )
      .map(([duplicateId, qty1, qty2, others]) => [
        { menuItemId: duplicateId, quantity: qty1 },
        ...others,
        { menuItemId: duplicateId, quantity: qty2 },
      ]);

    fc.assert(
      fc.property(itemsWithDuplicates, (items) => {
        const result = updateOrderItemsRequestSchema.safeParse({ items });
        expect(result.success).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
