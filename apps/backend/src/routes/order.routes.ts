import { Router } from 'express';
import { createOrder, getOrders, updateOrderStatus, registerPayment, updateOrderItems, deleteOrder } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';

const router = Router();

// GET /api/orders - List orders (optional status filter)
router.get('/', authMiddleware, syncUserMiddleware, getOrders);

// POST /api/orders - Create a new order
router.post('/', authMiddleware, syncUserMiddleware, createOrder);

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, updateOrderStatus);

// PUT /api/orders/:id/items - Update order items
router.put('/:id/items', authMiddleware, syncUserMiddleware, updateOrderItems);

// POST /api/orders/:id/payment - Register payment
router.post('/:id/payment', authMiddleware, syncUserMiddleware, registerPayment);

// DELETE /api/orders/:id - Delete an order
router.delete('/:id', authMiddleware, syncUserMiddleware, deleteOrder);

export default router;
