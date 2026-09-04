import { Router } from 'express';
import { login, logout, getSession, refreshToken } from '../controllers/auth.controller.js';
import { forgotPassword, resetPassword } from '../controllers/password-reset.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { syncUserMiddleware } from '../middleware/sync-user.middleware.js';
import { rateLimitMiddleware } from '../middleware/rate-limit.middleware.js';
import { forgotPasswordRateLimit } from '../middleware/forgot-password-rate-limit.middleware.js';

const router = Router();

// POST /api/auth/login - Rate limited, no auth required
router.post('/login', rateLimitMiddleware, login);

// POST /api/auth/logout - Auth required
router.post('/logout', authMiddleware, syncUserMiddleware, logout);

// POST /api/auth/refresh - No auth required (access token may be expired)
router.post('/refresh', refreshToken);

// GET /api/auth/session - Auth required, returns current user
router.get('/session', authMiddleware, syncUserMiddleware, getSession);

// POST /api/auth/forgot-password - Público, rate limit dedicado (IP + e-mail)
router.post('/forgot-password', forgotPasswordRateLimit, forgotPassword);

// POST /api/auth/reset-password - Público (validação por código)
router.post('/reset-password', resetPassword);

export default router;
