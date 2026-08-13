# Implementation Plan

## Overview
Fix the 401 "Sessão inválida" error that occurs when authenticated Supabase Auth users don't have a corresponding row in the application `users` table. Implement a `syncUserMiddleware` that auto-creates the user record on first authenticated access, and integrate it into all protected routes.

## Tasks

- [x] 1. Write bug condition exploration property test (validates: 1.1)
  - [x] 1.1 Create test file `apps/backend/src/__tests__/properties/user-sync.property.test.ts`
  - [x] 1.2 Write a fast-check property test demonstrating that `adminMiddleware` returns 401 when a valid Supabase Auth UID doesn't exist in the `users` table
  - [x] 1.3 Mock `pool.query` to return empty rows and call `adminMiddleware` with a random UUID
  - [x] 1.4 Verify the response is 401 with message "Sessão inválida. Faça login novamente."

- [x] 2. Create sync-user middleware (validates: 2.1, 2.2)
  - [x] 2.1 Create file `apps/backend/src/middleware/sync-user.middleware.ts`
  - [x] 2.2 Import `pool` from `../config/database.js` and `AuthenticatedRequest` from `./auth.middleware.js`
  - [x] 2.3 Implement `syncUserMiddleware` that queries `SELECT id FROM users WHERE id = $1` with `req.user.id`
  - [x] 2.4 If user doesn't exist, query `SELECT id FROM users WHERE role = 'admin' LIMIT 1` to check for existing admins
  - [x] 2.5 If no admin exists, insert user with role `admin`; otherwise insert with role `atendente`
  - [x] 2.6 Use `ON CONFLICT (id) DO NOTHING` to prevent race conditions on concurrent requests
  - [x] 2.7 Handle errors gracefully: log with `console.error` and call `next()` to not block the request

- [x] 3. Integrate sync-user middleware into routes (validates: 2.1, 3.1)
  - [x] 3.1 Update `apps/backend/src/routes/user.routes.ts` to import and add `syncUserMiddleware` after `authMiddleware` on all routes
  - [x] 3.2 Check for other route files that use `authMiddleware` and add `syncUserMiddleware` there too
  - [x] 3.3 Ensure middleware order is: `authMiddleware` → `syncUserMiddleware` → `adminMiddleware`/handler

- [x] 4. Write regression property tests (validates: 2.1, 2.2, 3.1, 3.3)
  - [x] 4.1 Add property test verifying that after `syncUserMiddleware` runs, a new user record exists in the table
  - [x] 4.2 Test that existing users are NOT overwritten when `syncUserMiddleware` runs
  - [x] 4.3 Test that the first user gets role `admin` when no admins exist
  - [x] 4.4 Test that subsequent users get role `atendente` when an admin already exists
  - [x] 4.5 Test that inactive users remain unchanged (sync doesn't reactivate them)

## Task Dependency Graph
```json
{
  "waves": [
    {"tasks": [1, 2], "description": "Exploration test and middleware creation (independent)"},
    {"tasks": [3], "description": "Route integration (depends on middleware from task 2)"},
    {"tasks": [4], "description": "Regression tests (depends on middleware + routes)"}
  ]
}
```

## Notes
- Task 1 is a bugfix exploration test — it PASSES to confirm the bug exists (adminMiddleware returns 401 for valid auth UIDs not in the users table)
- The `syncUserMiddleware` uses `ON CONFLICT (id) DO NOTHING` to safely handle race conditions when multiple concurrent requests arrive for the same new user
- On middleware error, we log and call `next()` rather than returning an error response — the downstream `adminMiddleware` will still return 401 if the row doesn't exist, which is acceptable for transient DB issues
- The first authenticated user auto-receives the `admin` role to bootstrap the system
