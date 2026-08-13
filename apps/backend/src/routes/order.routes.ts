import { Router } from 'express';
import { createOrder, getOrders, updateOrderStatus, registerPayment } from '../controllers/order.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';

const router = Router();

// GET /api/orders - List orders (optional status filter)
router.get('/', authMiddleware, syncUserMiddleware, getOrders);

// POST /api/orders - Create a new order
router.post('/', authMiddleware, syncUserMiddleware, createOrder);

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', authMiddleware, syncUserMiddleware, updateOrderStatus);

// POST /api/orders/:id/payment - Register payment
router.post('/:id/payment', authMiddleware, syncUserMiddleware, registerPayment);

export default router;
