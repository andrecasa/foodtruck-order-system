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
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

// GET /api/categories - List all categories
router.get('/', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, listCategories);

// POST /api/categories - Create a new category
router.post('/', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, createCategory);

// PUT /api/categories/reorder - Reorder categories (must be before /:id to avoid param conflict)
router.put('/reorder', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, reorderCategories);

// PUT /api/categories/:id - Update category
router.put('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, updateCategory);

// PATCH /api/categories/:id/status - Toggle category status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, toggleCategoryStatus);

// DELETE /api/categories/:id - Delete category
router.delete('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, deleteCategory);

export default router;
