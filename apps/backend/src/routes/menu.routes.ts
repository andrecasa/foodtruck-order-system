import { Router } from 'express';
import {
  getMenu,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemStatus,
  deleteMenuItem,
} from '../controllers/menu.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

// GET /api/menu - List active menu items grouped by category
router.get('/', authMiddleware, syncUserMiddleware, tenantMiddleware, getMenu);

// POST /api/menu - Create a new menu item
router.post('/', authMiddleware, syncUserMiddleware, tenantMiddleware, createMenuItem);

// PUT /api/menu/:id - Update an existing menu item
router.put('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, updateMenuItem);

// PATCH /api/menu/:id/status - Toggle item active/inactive
router.patch('/:id/status', authMiddleware, syncUserMiddleware, tenantMiddleware, toggleMenuItemStatus);

// DELETE /api/menu/:id - Delete a menu item
router.delete('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, deleteMenuItem);

export default router;
