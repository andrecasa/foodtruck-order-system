import { Router } from 'express';
import { getDailySummary, getMonthlySummary } from '../controllers/summary.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';

const router = Router();

// GET /api/summary/today - Get daily summary
router.get('/today', authMiddleware, syncUserMiddleware, getDailySummary);

// GET /api/summary/monthly - Get monthly summary with per-day breakdown
router.get('/monthly', authMiddleware, syncUserMiddleware, getMonthlySummary);

export default router;
