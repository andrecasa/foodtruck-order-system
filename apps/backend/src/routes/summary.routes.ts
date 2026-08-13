import { Router } from 'express';
import { getDailySummary } from '../controllers/summary.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';

const router = Router();

// GET /api/summary/today - Get daily summary
router.get('/today', authMiddleware, syncUserMiddleware, getDailySummary);

export default router;
