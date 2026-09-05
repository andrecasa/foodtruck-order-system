import { Router } from 'express';
import { createOrder, getOrders, getOrderById, updateOrderStatus, registerPayment, updateOrderItems, deleteOrder } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { asyncHandler } from '../http/async-handler.js';

const router = Router();

// GET /api/orders - List orders (optional status filter)
router.get('/', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getOrders));

// POST /api/orders - Create a new order
router.post('/', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(createOrder));

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(updateOrderStatus));

// GET /api/orders/:id - Get single order by ID
router.get('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getOrderById));

// PUT /api/orders/:id/items - Update order items
router.put('/:id/items', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(updateOrderItems));

// POST /api/orders/:id/payment - Register payment
router.post('/:id/payment', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(registerPayment));

// DELETE /api/orders/:id - Delete an order
router.delete('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(deleteOrder));

export default router;
