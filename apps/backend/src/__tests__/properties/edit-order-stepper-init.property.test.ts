import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: edit-order, Property 6: Stepper Initialization Reflects Active Order Items
 *
 * For any order containing a list of items, and for any menu state where some items
 * may be active and others inactive, when the EditOrderItemsScreen initializes,
 * the stepper quantities SHALL match the order's item quantities ONLY for items
 * whose referenced menu item is currently active, and inactive items SHALL not
 * appear in the stepper list.
 *
 * **Validates: Requirements 3.2, 3.6**
 */

/**
 * Pure utility function: initializes stepper quantities from order items,
 * filtering out items whose menu item is no longer active.
 *
 * @param orderItems - The order's current items (menuItemId + quantity)
 * @param activeMenuItemIds - Set of menu item IDs that are currently active
 * @returns Record<string, number> mapping menuItemId → quantity for active items only
 */
export function initializeStepperQuantities(
  orderItems: { menuItemId: string; quantity: number }[],
  activeMenuItemIds: Set<string>
): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const item of orderItems) {
    if (activeMenuItemIds.has(item.menuItemId)) {
      quantities[item.menuItemId] = item.quantity;
    }
  }
  return quantities;
}

describe('Property 6: Stepper Initialization Reflects Active Order Items', () => {
  // Generator: a pool of unique menu item IDs (some active, some inactive)
  const menuItemIdArb = fc.uuid();

  // Generator: a set of all menu item IDs and a subset that are active
  const menuStateArb = fc
    .array(menuItemIdArb, { minLength: 1, maxLength: 20 })
    .chain((allIds) => {
      // Deduplicate
      const uniqueIds = [...new Set(allIds)];
      if (uniqueIds.length === 0) return fc.constant({ allIds: [], activeIds: [] });

      // Randomly select which ones are active (at least 0, up to all)
      return fc
        .array(fc.boolean(), { minLength: uniqueIds.length, maxLength: uniqueIds.length })
        .map((flags) => ({
          allIds: uniqueIds,
          activeIds: uniqueIds.filter((_, i) => flags[i]),
        }));
    });

  // Generator: order items referencing a subset of all menu item IDs
  const orderWithMenuArb = menuStateArb.chain(({ allIds, activeIds }) => {
    if (allIds.length === 0) {
      return fc.constant({
        orderItems: [] as { menuItemId: string; quantity: number }[],
        activeIds,
        allIds,
      });
    }

    return fc
      .array(
        fc.record({
          index: fc.integer({ min: 0, max: allIds.length - 1 }),
          quantity: fc.integer({ min: 1, max: 99 }),
        }),
        { minLength: 0, maxLength: Math.min(allIds.length, 10) }
      )
      .map((selections) => {
        // Deduplicate by index (each menu item can only appear once in order)
        const usedIndices = new Set<number>();
        const items = selections.filter((s) => {
          if (usedIndices.has(s.index)) return false;
          usedIndices.add(s.index);
          return true;
        });

        return {
          orderItems: items.map((s) => ({
            menuItemId: allIds[s.index],
            quantity: s.quantity,
          })),
          activeIds,
          allIds,
        };
      });
  });

  it('stepper quantities match order item quantities only for active menu items', async () => {
    fc.assert(
      fc.property(orderWithMenuArb, ({ orderItems, activeIds }) => {
        const activeSet = new Set(activeIds);
        const result = initializeStepperQuantities(orderItems, activeSet);

        // Property 6a: For every active order item, stepper has correct quantity
        for (const item of orderItems) {
          if (activeSet.has(item.menuItemId)) {
            expect(result[item.menuItemId]).toBe(item.quantity);
          }
        }

        // Property 6b: No inactive items appear in stepper result
        for (const menuItemId of Object.keys(result)) {
          expect(activeSet.has(menuItemId)).toBe(true);
        }

        // Property 6c: Stepper only contains items from the order (not random active items)
        const orderMenuItemIds = new Set(orderItems.map((i) => i.menuItemId));
        for (const menuItemId of Object.keys(result)) {
          expect(orderMenuItemIds.has(menuItemId)).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('inactive order items are excluded from stepper initialization', async () => {
    fc.assert(
      fc.property(orderWithMenuArb, ({ orderItems, activeIds }) => {
        const activeSet = new Set(activeIds);
        const result = initializeStepperQuantities(orderItems, activeSet);

        // Count how many order items reference inactive menu items
        const inactiveOrderItems = orderItems.filter(
          (item) => !activeSet.has(item.menuItemId)
        );

        // None of those inactive items should appear in the result
        for (const item of inactiveOrderItems) {
          expect(result[item.menuItemId]).toBeUndefined();
        }

        // The result should have exactly the count of active order items
        const activeOrderItems = orderItems.filter((item) =>
          activeSet.has(item.menuItemId)
        );
        expect(Object.keys(result).length).toBe(activeOrderItems.length);
      }),
      { numRuns: 100 }
    );
  });

  it('active menu items not in the order have implicit quantity 0 (not in map)', async () => {
    fc.assert(
      fc.property(orderWithMenuArb, ({ orderItems, activeIds }) => {
        const activeSet = new Set(activeIds);
        const result = initializeStepperQuantities(orderItems, activeSet);

        // Active menu items not referenced in order should not be in result
        const orderMenuItemIds = new Set(orderItems.map((i) => i.menuItemId));
        for (const activeId of activeIds) {
          if (!orderMenuItemIds.has(activeId)) {
            expect(result[activeId]).toBeUndefined();
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
