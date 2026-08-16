# Implementation Plan: Categories CRUD

## Overview

Implement a full CRUD module for managing menu categories, following the same patterns as the existing menu items CRUD. This includes a database migration, shared types/validators, backend API endpoints (6 routes), mobile API client methods, two mobile screens (list + form), Drawer navigation integration with role-based access control, and property-based + unit tests.

## Tasks

- [x] 1. Database migration and shared types
  - [x] 1.1 Create migration `012_add_category_status.sql`
    - Add `status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo'))` column to `categories` table
    - Use `ADD COLUMN IF NOT EXISTS` for idempotency
    - _Requirements: 5.1, 5.7_

  - [x] 1.2 Create shared types in `packages/shared/src/types/category.ts`
    - Define `CategoryStatus = 'ativo' | 'inativo'`
    - Define `Category` interface: id, name, sortOrder, status, itemCount, createdAt
    - Define `CreateCategoryRequest`, `UpdateCategoryRequest`, `ReorderCategoriesRequest`
    - Export from `packages/shared` barrel file
    - _Requirements: 1.1, 2.1, 3.1, 4.1_

  - [x] 1.3 Create Zod validators in `packages/shared/src/validators/category.validator.ts`
    - `createCategoryRequestSchema`: name string 1–100 chars with trim + whitespace-only refine
    - `updateCategoryRequestSchema`: same as create
    - `reorderCategoriesRequestSchema`: categoryIds array of uuid strings, min 1
    - Export from `packages/shared` barrel file
    - _Requirements: 2.3, 2.4, 3.4, 3.5, 4.4_

- [x] 2. Backend API endpoints
  - [x] 2.1 Create `apps/backend/src/controllers/category.controller.ts`
    - `listCategories`: SELECT with LEFT JOIN on menu_items + COUNT, ORDER BY sort_order ASC, name ASC
    - `createCategory`: validate with Zod, check uniqueness (ILIKE), compute max(sort_order)+1, INSERT with status 'ativo'
    - `updateCategory`: validate, check existence (404), check uniqueness excluding self (409), UPDATE name
    - `reorderCategories`: validate list, check duplicates, check all IDs exist, check count matches total, UPDATE in transaction
    - `toggleCategoryStatus`: check existence, validate current status transition, guard active items for deactivation, UPDATE
    - `deleteCategory`: check existence, guard associated items, DELETE
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3_

  - [x] 2.2 Create `apps/backend/src/routes/category.routes.ts`
    - Register all 6 routes with `authMiddleware → syncUserMiddleware → adminMiddleware` chain
    - `GET /` → listCategories
    - `POST /` → createCategory
    - `PUT /reorder` → reorderCategories (must be before `/:id` to avoid param conflict)
    - `PUT /:id` → updateCategory
    - `PATCH /:id/status` → toggleCategoryStatus
    - `DELETE /:id` → deleteCategory
    - _Requirements: 7.1_

  - [x] 2.3 Register category routes in app entry point
    - Import and mount `categoryRoutes` at `/api/categories` in `apps/backend/src/index.ts` (or equivalent app setup file)
    - _Requirements: 7.1_

  - [x] 2.4 Update `GET /api/menu` to filter inactive categories
    - Modify `getMenu` in `menu.controller.ts` to add `AND c.status = 'ativo'` condition when not showing all items
    - _Requirements: 5.7_

- [x] 3. Checkpoint - Backend compiles and endpoints work
  - Run `npm run build` in apps/backend to verify compilation
  - Ensure all existing tests still pass

- [x] 4. Mobile API client and navigation
  - [x] 4.1 Add category methods to API client
    - Add method signatures to `apps/mobile/src/services/types.ts` (or equivalent interface)
    - Implement in real client: `getCategories`, `createCategory`, `updateCategory`, `reorderCategories`, `toggleCategoryStatus`, `deleteCategory`
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1_

  - [x] 4.2 Add Drawer menu item "Categorias" with role guard
    - Add "Categorias" item with `folder_open` icon to Drawer navigation
    - Only render for users with role `admin`
    - _Requirements: 7.2_

  - [x] 4.3 Add route files for categories screens
    - Create route `app/categories-list.tsx` rendering `CategoriesListScreen`
    - Create route `app/category-form.tsx` rendering `CategoryFormScreen` (with params for create/edit mode)
    - Add role guard: redirect non-admin to pedidos queue
    - _Requirements: 7.3_

- [x] 5. Mobile screens
  - [x] 5.1 Create `CategoriesListScreen`
    - Location: `apps/mobile/src/screens/CategoriesListScreen.tsx`
    - Header with title "Categorias"
    - Fetch and display categories list via `apiClient.getCategories()`
    - Each item shows: name, item count, status toggle
    - Drag-and-drop reorder with optimistic update and rollback on error
    - Swipe or long-press to reveal delete action
    - FAB or header button "+ Nova Categoria" navigates to form
    - Empty state: "Nenhuma categoria cadastrada"
    - Error state: message + "Tentar novamente" button
    - Loading state: ActivityIndicator
    - Delete: confirmation dialog with category name, calls `apiClient.deleteCategory`
    - Status toggle: calls `apiClient.toggleCategoryStatus`, updates UI on success, Alert on error
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.6, 4.7, 5.8, 6.4, 6.5, 6.6_

  - [x] 5.2 Create `CategoryFormScreen`
    - Location: `apps/mobile/src/screens/CategoryFormScreen.tsx`
    - Props via route params: `id?` (edit mode) and `name?` (pre-fill)
    - Single text input for category name
    - Header: "Nova Categoria" (create) or "Editar Categoria" (edit)
    - On submit: calls `createCategory` or `updateCategory`, navigates back on success
    - Validation: inline error for empty/whitespace/too-long name
    - Error handling: shows API error message, preserves form data
    - Pre-fills name in edit mode
    - _Requirements: 2.1, 2.5, 2.6, 3.1, 3.7, 3.8_

- [x] 6. Checkpoint - Full feature flow works end-to-end
  - Verify: list → create → edit → reorder → toggle → delete flows
  - Verify: non-admin cannot access categories
  - Verify: inactive categories hidden from public menu

- [x] 7. Property-based tests
  - [x] 7.1 Category ordering invariant
    - File: `apps/backend/src/__tests__/properties/category-ordering.property.test.ts`
    - Generate random category sets, verify list returns sorted by sort_order ASC then name ASC
    - **Property 1: Ordering invariant**
    - _Requirements: 1.2_

  - [x] 7.2 Category name validation
    - File: `apps/backend/src/__tests__/properties/category-name-validation.property.test.ts`
    - Generate strings (empty, whitespace-only, >100 chars, valid), verify correct accept/reject
    - **Property 2: Name validation**
    - _Requirements: 2.3, 3.4_

  - [x] 7.3 Category name uniqueness
    - File: `apps/backend/src/__tests__/properties/category-uniqueness.property.test.ts`
    - Generate pairs of names (same case-insensitive, different), verify uniqueness enforcement
    - **Property 3: Name uniqueness**
    - _Requirements: 2.2, 3.2, 3.6_

  - [x] 7.4 Category creation defaults
    - File: `apps/backend/src/__tests__/properties/category-creation.property.test.ts`
    - Generate valid names with varying existing categories, verify sort_order and status defaults
    - **Property 4: Creation assigns correct defaults**
    - _Requirements: 2.1_

  - [x] 7.5 Category reorder sort_order assignment
    - File: `apps/backend/src/__tests__/properties/category-reorder.property.test.ts`
    - Generate permutations of category IDs, verify sort_order matches index position
    - **Property 5: Reorder assigns position-based sort_order**
    - _Requirements: 4.1_

  - [x] 7.6 Category reorder list validation
    - File: `apps/backend/src/__tests__/properties/category-reorder-validation.property.test.ts`
    - Generate invalid lists (duplicates, missing, extra IDs), verify all rejected with 422
    - **Property 6: Reorder list completeness**
    - _Requirements: 4.2, 4.5_

  - [x] 7.7 Category deactivation guard
    - File: `apps/backend/src/__tests__/properties/category-deactivation-guard.property.test.ts`
    - Generate categories with varying active item counts, verify deactivation allowed only when 0 active items
    - **Property 7: Deactivation guard**
    - _Requirements: 5.1, 5.2_

  - [x] 7.8 Inactive categories excluded from menu
    - File: `apps/backend/src/__tests__/properties/category-inactive-filter.property.test.ts`
    - Generate mix of active/inactive categories with items, verify public menu excludes inactive
    - **Property 8: Inactive categories excluded from public menu**
    - _Requirements: 5.7_

  - [x] 7.9 Category deletion guard
    - File: `apps/backend/src/__tests__/properties/category-deletion-guard.property.test.ts`
    - Generate categories with 0 or more items, verify deletion only succeeds with 0 items
    - **Property 9: Deletion guard**
    - _Requirements: 6.1, 6.2_

  - [x] 7.10 Category access control
    - File: `apps/backend/src/__tests__/properties/category-access-control.property.test.ts`
    - Generate requests with different roles, verify admin succeeds and others get 403
    - **Property 10: Access control**
    - _Requirements: 7.1_

- [x] 8. Unit tests
  - [x] 8.1 Backend controller unit tests
    - File: `apps/backend/src/__tests__/unit/category-controller.test.ts`
    - Test: listCategories returns categories with item counts
    - Test: createCategory with valid name returns 201
    - Test: createCategory with duplicate name returns 409
    - Test: createCategory with missing name returns 422
    - Test: updateCategory with non-existent ID returns 404
    - Test: reorderCategories with empty list returns 422
    - Test: toggleCategoryStatus deactivate with active items returns 422
    - Test: toggleCategoryStatus already inactive returns 422
    - Test: deleteCategory with associated items returns 422
    - Test: deleteCategory with non-existent ID returns 404
    - _Requirements: 1.1, 2.1, 2.2, 2.4, 3.3, 4.4, 5.2, 5.4, 6.2, 6.3_

  - [x] 8.2 Mobile screen unit tests
    - File: `apps/mobile/src/__tests__/unit/categories-list-screen.test.tsx`
    - Test: renders categories list
    - Test: empty state shows "Nenhuma categoria cadastrada"
    - Test: error state shows retry button
    - Test: delete confirmation dialog appears with category name
    - Test: cancel delete does not call API
    - Test: Drawer hides "Categorias" for non-admin
    - _Requirements: 1.3, 1.4, 1.5, 6.4, 6.5, 7.2_

- [x] 9. Final checkpoint - All tests pass
  - Run full test suite
  - Verify no regressions in existing menu items tests

## Notes

- The `categories` table already exists (migration 002); we only add the `status` column
- Follow exact patterns from `menu.controller.ts` and `menu.routes.ts` for consistency
- The `adminMiddleware` already exists and is used in user management routes
- Drag-and-drop on mobile can use `react-native-draggable-flatlist` if already in the project, or a simple manual reorder UI
- The Drawer menu item "Categorias" with `folder_open` icon is already designed in Penpot Design System
- Property tests use fast-check v4.9+ with vitest, numRuns: 100

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] },
    { "id": 2, "tasks": ["3"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["6"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10"] },
    { "id": 7, "tasks": ["8.1", "8.2"] },
    { "id": 8, "tasks": ["9"] }
  ]
}
```
