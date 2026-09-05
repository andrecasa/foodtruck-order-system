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
import { asyncHandler } from '../http/async-handler.js';

const router = Router();

// GET /api/categories - List all categories
router.get('/', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(listCategories));

// POST /api/categories - Create a new category
router.post('/', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(createCategory));

// PUT /api/categories/reorder - Reorder categories (must be before /:id to avoid param conflict)
router.put('/reorder', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(reorderCategories));

// PUT /api/categories/:id - Update category
router.put('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(updateCategory));

// PATCH /api/categories/:id/status - Toggle category status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(toggleCategoryStatus));

// DELETE /api/categories/:id - Delete category
router.delete('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, adminMiddleware, asyncHandler(deleteCategory));

export default router;
