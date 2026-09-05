import { Router } from 'express';
import {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  resetPassword,
} from '../controllers/user.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { adminMiddleware } from '../middleware/role.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { asyncHandler } from '../http/async-handler.js';

const router = Router();

// POST /api/users - Create a new user
router.post('/', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(createUser));

// GET /api/users - List all users
router.get('/', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(listUsers));

// GET /api/users/:id - Get user by ID
router.get('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(getUserById));

// PUT /api/users/:id - Update user
router.put('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(updateUser));

// PATCH /api/users/:id/status - Toggle user status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(toggleUserStatus));

// DELETE /api/users/:id - Delete user
router.delete('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(deleteUser));

// PATCH /api/users/:id/password - Reset user password
router.patch('/:id/password', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(resetPassword));

export default router;
