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

const router = Router();

// POST /api/users - Create a new user
router.post('/', authMiddleware, syncUserMiddleware, adminMiddleware, createUser);

// GET /api/users - List all users
router.get('/', authMiddleware, syncUserMiddleware, adminMiddleware, listUsers);

// GET /api/users/:id - Get user by ID
router.get('/:id', authMiddleware, syncUserMiddleware, adminMiddleware, getUserById);

// PUT /api/users/:id - Update user
router.put('/:id', authMiddleware, syncUserMiddleware, adminMiddleware, updateUser);

// PATCH /api/users/:id/status - Toggle user status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, adminMiddleware, toggleUserStatus);

// DELETE /api/users/:id - Delete user
router.delete('/:id', authMiddleware, syncUserMiddleware, adminMiddleware, deleteUser);

// PATCH /api/users/:id/password - Reset user password
router.patch('/:id/password', authMiddleware, syncUserMiddleware, adminMiddleware, resetPassword);

export default router;
