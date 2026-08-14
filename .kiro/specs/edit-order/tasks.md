# Implementation Plan: Edit Order Items

## Overview

Implement the ability to edit items in an existing order with `aguardando` status. This involves adding a new `UpdateOrderItemsRequest` type and Zod schema in the shared package, a new `PUT /api/orders/:id/items` endpoint on the backend, a new `EditOrderItemsScreen` on the mobile app that reuses the stepper UI from `CreateOrderScreen`, and updates to the `PaymentScreen` for conditional button visibility and correct navigation.

## Tasks

- [x] 1. Add shared types and validation schema
  - [x] 1.1 Add `UpdateOrderItemsRequest` type and `updateOrderItemsRequestSchema` Zod validator
    - Add `UpdateOrderItemsRequest` interface to `packages/shared/src/types/order.ts`
    - Add `updateOrderItemsRequestSchema` to `packages/shared/src/validators/order.validator.ts` with: items array (min 1, max 50), each item has `menuItemId` (UUID string) and `quantity` (int, min 1, max 99), refine to reject duplicate menuItemIds
    - Export the new type and schema from the shared package barrel
    - _Requirements: 1.3, 1.6, 1.8_

  - [x] 1.2 Write property test for schema validation (Property 3)
    - **Property 3: Schema Validation Rejects Invalid Inputs**
    - Test that any items array violating length < 1, length > 50, quantity < 1 or > 99, non-UUID menuItemId, or duplicate menuItemIds is rejected by `updateOrderItemsRequestSchema`
    - File: `apps/backend/src/__tests__/properties/edit-order-validation.property.test.ts`
    - **Validates: Requirements 1.3, 1.6, 1.8**

- [x] 2. Implement backend endpoint
  - [x] 2.1 Add `updateOrderItems` controller function
    - Add function to `apps/backend/src/controllers/order.controller.ts`
    - Validate request body with `updateOrderItemsRequestSchema`
    - Look up order by ID, return 404 if not found
    - Check order status is `aguardando`, return 422 if not
    - Validate all menu items exist and are active, return 422 if any invalid
    - Check for duplicate menuItemIds (schema handles this, but belt-and-suspenders)
    - Execute transaction: DELETE old order_items → INSERT new order_items with price snapshots → UPDATE orders.total_amount_cents
    - Broadcast `order_updated` event on `orders:queue` channel
    - Return 200 with full updated order
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Register route `PUT /api/orders/:id/items`
    - Add route to `apps/backend/src/routes/order.routes.ts` with `authMiddleware` and `syncUserMiddleware`
    - _Requirements: 1.1_

  - [x] 2.3 Write property test for total calculation (Property 1)
    - **Property 1: Total Calculation Invariant**
    - Verify that for any valid set of items with known prices and quantities, the returned totalAmountCents equals Σ(price_cents × quantity) and each item's unitPriceCents matches the menu item's current price
    - File: `apps/backend/src/__tests__/properties/edit-order-total.property.test.ts`
    - **Validates: Requirements 1.1, 5.2**

  - [x] 2.4 Write property test for status guard (Property 2)
    - **Property 2: Status Guard**
    - Verify that for any order with status ≠ `aguardando` and any valid item list, the update is rejected with 422 and the order remains unchanged
    - File: `apps/backend/src/__tests__/properties/edit-order-status-guard.property.test.ts`
    - **Validates: Requirements 1.2, 5.3**

  - [x] 2.5 Write property test for invalid menu items (Property 4)
    - **Property 4: Invalid Menu Items Cause Atomic Rejection**
    - Verify that if any item references a non-existent or inactive menu item, the entire request is rejected and order data remains unchanged
    - File: `apps/backend/src/__tests__/properties/edit-order-invalid-items.property.test.ts`
    - **Validates: Requirements 1.4, 5.4**

  - [x] 2.6 Write property test for transaction atomicity (Property 5)
    - **Property 5: Transaction Atomicity on Failure**
    - Verify that when a DB error occurs mid-transaction, the order's items and total remain identical to pre-request state (mocked pool)
    - File: `apps/backend/src/__tests__/properties/edit-order-atomicity.property.test.ts`
    - **Validates: Requirements 5.1, 5.5**

- [x] 3. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Update mobile API client layer
  - [x] 4.1 Add `updateOrderItems` method to `ApiClient` interface and implementations
    - Add `updateOrderItems(orderId: string, data: UpdateOrderItemsRequest): Promise<Order>` to `apps/mobile/src/services/types.ts`
    - Implement in `apps/mobile/src/services/real-client.ts` calling `PUT /api/orders/:id/items`
    - Implement in `apps/mobile/src/mocks/mock-client.ts` with mock logic (validate status aguardando, replace items, recalculate total)
    - _Requirements: 4.1, 3.1_

- [x] 5. Implement EditOrderItemsScreen
  - [x] 5.1 Create `EditOrderItemsScreen` component
    - Create `apps/mobile/src/screens/EditOrderItemsScreen.tsx`
    - Receive `orderId` from navigation params
    - On mount: load active menu via `apiClient.getMenu()`, resolve order data from navigation params or context
    - Pre-fill stepper quantities from `order.items` (only for items whose menu item is still active)
    - Show header "Editar Itens" (no customer name or origin fields)
    - Reuse stepper UI pattern from `CreateOrderScreen` (category-grouped items with +/- steppers)
    - Show real-time total calculation
    - "Salvar Alterações" button sends `PUT /api/orders/:id/items` via `apiClient.updateOrderItems`
    - On success: navigate back to PaymentScreen with updated order data
    - On error: show error message inline
    - Loading state while submitting (disable button and steppers)
    - Show "Adicione ao menos um item ao pedido" if no items selected
    - Show loading indicator until menu and order data are available
    - Show error message if menu or order data fails to load
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Write property test for stepper initialization (Property 6)
    - **Property 6: Stepper Initialization Reflects Active Order Items**
    - Verify that for any order items and menu state, stepper quantities match order item quantities only for active menu items, and inactive items are excluded
    - File: `apps/backend/src/__tests__/properties/edit-order-stepper-init.property.test.ts`
    - **Validates: Requirements 3.2, 3.6**

- [x] 6. Update PaymentScreen
  - [x] 6.1 Implement conditional button visibility and correct navigation
    - Hide "+ Adicionar Item" button when `paymentStatus === 'pago'` (currently always shown)
    - Change navigation target from `router.replace('/(tabs)/new-order')` to navigate to `EditOrderItemsScreen` passing `orderId`
    - Subscribe to Realtime payment events to reactively hide button when payment status changes
    - _Requirements: 2.1, 2.2, 2.3, 3.1_

  - [x] 6.2 Add route configuration for EditOrderItemsScreen
    - Add expo-router route file for the EditOrderItemsScreen so navigation works correctly
    - _Requirements: 3.1_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integration wiring and final verification
  - [x] 8.1 Wire end-to-end flow and verify integration
    - Verify the full flow: PaymentScreen → EditOrderItemsScreen → save → return to PaymentScreen with updated data
    - Ensure Realtime broadcast of `order_updated` event works on the `orders:queue` channel
    - Verify button hides after payment is registered (Realtime reactive update)
    - _Requirements: 1.7, 2.3, 4.1_

  - [x] 8.2 Write unit tests for PaymentScreen button visibility and EditOrderItemsScreen
    - Test button renders when `paymentStatus === 'pendente'`
    - Test button hidden when `paymentStatus === 'pago'`
    - Test navigation passes `orderId` parameter
    - Test EditOrderItemsScreen shows "Editar Itens" header
    - Test EditOrderItemsScreen hides customer name and origin fields
    - Test loading and error states
    - _Requirements: 2.1, 2.2, 3.4, 3.5, 4.2, 4.3_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The shared package changes (task 1) must be completed first as both backend and mobile depend on it
- The backend endpoint (task 2) must be ready before mobile API client can be tested against it
- The stepper initialization property test (5.2) tests pure logic and can be a standalone utility function extracted from the screen

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["4.1"] },
    { "id": 4, "tasks": ["5.1", "5.2", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["8.1", "8.2"] }
  ]
}
```
