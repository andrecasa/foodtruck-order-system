import express from 'express';
import cors from 'cors';
import { runMigrations } from './db/run-migrations.js';
import authRoutes from './routes/auth.routes.js';
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import summaryRoutes from './routes/summary.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import userRoutes from './routes/user.routes.js';

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

async function start() {
  try {
    await runMigrations();
    console.log('[server] Migrations completed.');
  } catch (error) {
    console.error('[server] Migration failed, starting without DB:', error);
  }

  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
}

start();

export default app;
