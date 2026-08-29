import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { publicTenantMiddleware } from '../middleware/public-tenant.middleware.js';
import {
  publicBrandingController,
  publicMenuController,
  publicCreateOrderController,
  publicOrderStatusController,
} from '../controllers/public.controller.js';

/**
 * Public (unauthenticated) router for the customer ordering flow, mounted at
 * `/api/public` (see `index.ts`).
 *
 * Hardening (R11) is applied LOCALLY to this router so the rest of the API is
 * untouched:
 *   - `rateLimit` — 60 requests/min per IP across all public routes (R11.1).
 *   - `express.json({ limit: '10kb' })` — a router-local body parser so the
 *     10KB cap applies here WITHOUT changing the global `express.json()` in
 *     `index.ts` (R11.2).
 *   - `publicTenantMiddleware` — resolves the tenant from `:slug` (created in
 *     Task 3). No `authMiddleware`/`tenantMiddleware`: these routes are public.
 *
 * Design: `.kiro/specs/customer-ordering/design.md` → "Backend — Rotas Públicas".
 */

const router = Router();

// R11.1 — per-IP rate limit (60 req/min). Returns 429 with a stable error code
// when exceeded. `standardHeaders` emits the RateLimit-* headers.
const publicRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'TOO_MANY_REQUESTS' },
});

router.use(publicRateLimiter);

// R11.2 — router-local JSON parser with a 10KB cap. Kept separate from the
// global parser so only the public routes carry this restriction.
router.use(express.json({ limit: '10kb' }));

// All public routes are slug-scoped: resolve the tenant before the controllers.
router.use('/:slug', publicTenantMiddleware);

// GET /api/public/:slug/branding — public tenant identity (R5).
router.get('/:slug/branding', publicBrandingController);

// GET /api/public/:slug/menu — active menu grouped by category (R2).
router.get('/:slug/menu', publicMenuController);

// POST /api/public/:slug/orders — create an online order, origin 'web' (R3).
router.post('/:slug/orders', publicCreateOrderController);

// GET /api/public/:slug/orders/:orderId — public order status tracking (R4).
router.get('/:slug/orders/:orderId', publicOrderStatusController);

export default router;
