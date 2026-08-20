import { Router } from 'express';
import { createOrder, getOrders, getOrderById, updateOrderStatus, registerPayment, updateOrderItems, deleteOrder } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

// GET /api/orders - List orders (optional status filter)
router.get('/', authMiddleware, syncUserMiddleware, tenantMiddleware, getOrders);

// POST /api/orders - Create a new order
router.post('/', authMiddleware, syncUserMiddleware, tenantMiddleware, createOrder);

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, tenantMiddleware, updateOrderStatus);

// GET /api/orders/:id - Get single order by ID
router.get('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, getOrderById);

// PUT /api/orders/:id/items - Update order items
router.put('/:id/items', authMiddleware, syncUserMiddleware, tenantMiddleware, updateOrderItems);

// POST /api/orders/:id/payment - Register payment
router.post('/:id/payment', authMiddleware, syncUserMiddleware, tenantMiddleware, registerPayment);

// DELETE /api/orders/:id - Delete an order
router.delete('/:id', authMiddleware, syncUserMiddleware, tenantMiddleware, deleteOrder);

export default router;
