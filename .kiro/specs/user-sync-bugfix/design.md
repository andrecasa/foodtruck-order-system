# Design: User Sync Middleware (Bugfix)

## Overview

The `adminMiddleware` queries the `users` table by Supabase Auth UID (`req.user.id`) but finds no matching row, resulting in a 401 error for legitimately authenticated users. This happens because user rows in the `users` table were historically created with `gen_random_uuid()` and never linked to Supabase Auth UIDs.

The fix introduces a `syncUserMiddleware` that runs **after** `authMiddleware` (which validates the JWT and sets `req.user`) and **before** `adminMiddleware` (which queries the `users` table). This middleware ensures a corresponding row exists in the `users` table before any role/permission check occurs.

## Components

### 1. `syncUserMiddleware` (new file)

**File:** `apps/backend/src/middleware/sync-user.middleware.ts`

```typescript
import { Response, NextFunction } from 'express';
import { pool } from '../config/database.js';
import type { AuthenticatedRequest } from './auth.middleware.js';

export async function syncUserMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;
  if (!user || !user.id) {
    next();
    return;
  }

  try {
    // Check if user already exists
    const existing = await pool.query('SELECT id FROM users WHERE id = $1', [user.id]);

    if (existing.rows.length === 0) {
      // Determine role: first user becomes admin
      const adminCheck = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' LIMIT 1",
      );
      const role = adminCheck.rows.length === 0 ? 'admin' : 'atendente';

      // Derive default name from email prefix
      const name = user.email.split('@')[0] || 'user';

      // Insert with ON CONFLICT to handle race conditions
      await pool.query(
        `INSERT INTO users (id, email, name, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ativo', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, name, role],
      );
    }

    next();
  } catch (err) {
    console.error('[sync-user-middleware] Error syncing user:', err);
    // Don't block the request — let downstream middlewares handle auth
    next();
  }
}
```

**Key decisions:**
- Uses `ON CONFLICT (id) DO NOTHING` to prevent race conditions when concurrent requests arrive for the same new user.
- On error, logs and calls `next()` instead of returning an error — this avoids blocking users due to transient DB issues (the downstream `adminMiddleware` will still return 401 if the row doesn't exist, which is acceptable).
- First user ever gets `admin` role; subsequent users get `atendente`.

### 2. Route integration (modified files)

The middleware must be added to **all** route files that use `authMiddleware`:

| File | Current chain | New chain |
|------|--------------|-----------|
| `routes/user.routes.ts` | `authMiddleware, adminMiddleware, handler` | `authMiddleware, syncUserMiddleware, adminMiddleware, handler` |
| `routes/order.routes.ts` | `authMiddleware, handler` | `authMiddleware, syncUserMiddleware, handler` |
| `routes/menu.routes.ts` | `authMiddleware, handler` | `authMiddleware, syncUserMiddleware, handler` |
| `routes/summary.routes.ts` | `authMiddleware, handler` | `authMiddleware, syncUserMiddleware, handler` |
| `routes/auth.routes.ts` | `authMiddleware, handler` | `authMiddleware, syncUserMiddleware, handler` |

## Data Flow

```
Request with JWT
       │
       ▼
┌─────────────────┐
│ authMiddleware   │  Validates JWT via Supabase Auth
│                  │  Sets req.user = { id, email }
└────────┬────────┘
         │
         ▼
┌─────────────────────┐
│ syncUserMiddleware   │  Checks users table for req.user.id
│                      │  If missing → INSERT new row
│                      │  If exists → no-op
└────────┬────────────┘
         │
         ▼
┌─────────────────┐
│ adminMiddleware  │  Queries users table (row now guaranteed to exist)
│  (or handler)    │  Checks role + status
└────────┬────────┘
         │
         ▼
     Handler
```

### Insert logic

1. Query: `SELECT id FROM users WHERE id = $1`
2. If no row:
   - Query: `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
   - If no admin exists → `role = 'admin'`
   - If admin exists → `role = 'atendente'`
   - `name = email.split('@')[0]`
   - `status = 'ativo'`
   - Insert with `ON CONFLICT (id) DO NOTHING`
3. Call `next()`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| DB query fails in `syncUserMiddleware` | Log error, call `next()` — downstream middleware will handle (may 401 if row still missing) |
| Race condition (two requests for same new user) | `ON CONFLICT (id) DO NOTHING` ensures only one row is created, no error thrown |
| `req.user` is undefined or missing `id` | Skip sync logic, call `next()` immediately |
| User already exists | No-op, call `next()` |
| User exists but is `inativo` | No modification — `adminMiddleware` will return 403 as expected |
