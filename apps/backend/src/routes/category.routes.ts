import { Router } from 'express';
import {
  listCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  toggleCategoryStatus,
  deleteCategory,
} from '../controllers/category.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { adminMiddleware } from '../middleware/role.middleware.js';

const router = Router();

// GET /api/categories - List all categories
router.get('/', authMiddleware, syncUserMiddleware, adminMiddleware, listCategories);

// POST /api/categories - Create a new category
router.post('/', authMiddleware, syncUserMiddleware, adminMiddleware, createCategory);

// PUT /api/categories/reorder - Reorder categories (must be before /:id to avoid param conflict)
router.put('/reorder', authMiddleware, syncUserMiddleware, adminMiddleware, reorderCategories);

// PUT /api/categories/:id - Update category
router.put('/:id', authMiddleware, syncUserMiddleware, adminMiddleware, updateCategory);

// PATCH /api/categories/:id/status - Toggle category status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, adminMiddleware, toggleCategoryStatus);

// DELETE /api/categories/:id - Delete category
router.delete('/:id', authMiddleware, syncUserMiddleware, adminMiddleware, deleteCategory);

export default router;
