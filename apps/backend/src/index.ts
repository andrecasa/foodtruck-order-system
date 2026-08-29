import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/run-migrations.js';
import authRoutes from './routes/auth.routes.js';
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import summaryRoutes from './routes/summary.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import userRoutes from './routes/user.routes.js';
import categoryRoutes from './routes/category.routes.js';
import tenantRoutes from './routes/tenant.routes.js';
import platformRoutes from './routes/platform.routes.js';
import publicRoutes from './routes/public.routes.js';

const app = express();
const PORT = process.env.BACKEND_PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/summary', summaryRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tenant', tenantRoutes);
// Platform routes: authMiddleware + platformAdminMiddleware, WITHOUT tenantMiddleware (R10.2).
app.use('/api/platform', platformRoutes);
// Public customer-ordering routes: NO auth. Tenant resolved from :slug, with
// router-local hardening (rate limit + 10kb body parser) — see public.routes.ts (R11).
app.use('/api/public', publicRoutes);

async function start() {
  try {
    await runMigrations();
    console.log('[server] Migrations completed.');
  } catch (error) {
    console.error('[server] Migration failed, starting without DB:', error);
  }

  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    // Realtime channels are subscribed lazily on first broadcast per tenant
    // (see config/realtime.ts). No global pre-warm: it cannot scale to N
    // tenants (R12.7).
  });
}

start();

export default app;
