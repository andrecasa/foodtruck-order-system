import { Router } from 'express';
import { login, logout, getSession } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware.js';

const router = Router();

// POST /api/auth/login - Rate limited, no auth required
router.post('/login', rateLimitMiddleware, login);

// POST /api/auth/logout - Auth required
router.post('/logout', authMiddleware, syncUserMiddleware, logout);

// GET /api/auth/session - Auth required, returns current user
router.get('/session', authMiddleware, syncUserMiddleware, getSession);

export default router;
