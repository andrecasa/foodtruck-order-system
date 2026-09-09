import { Router } from 'express';
import {
  getDailySummary,
  getMonthlySummary,
  getMonthlyHeatmap,
  getDailyTopProducts,
  getMonthlyTopProducts,
} from '../controllers/summary.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { asyncHandler } from '../http/async-handler.js';

const router = Router();

// GET /api/summary/today - Get daily summary
router.get('/today', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getDailySummary));

// GET /api/summary/monthly - Get monthly summary with per-day breakdown
router.get('/monthly', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getMonthlySummary));

// GET /api/summary/monthly/heatmap - Heatmap points + total/geolocated counters
router.get('/monthly/heatmap', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getMonthlyHeatmap));

// GET /api/summary/top-products/daily - Top 10 produtos mais vendidos do dia
router.get('/top-products/daily', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getDailyTopProducts));

// GET /api/summary/top-products/monthly - Top 10 produtos mais vendidos do mês
router.get('/top-products/monthly', authMiddleware, syncUserMiddleware, tenantMiddleware, asyncHandler(getMonthlyTopProducts));

export default router;
