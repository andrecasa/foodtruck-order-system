import { Router } from 'express';
import { webhookEvolution } from '../bot/whatsapp.controller.js';

const router = Router();

// POST /api/webhook/evolution - Evolution API webhook
router.post('/evolution', webhookEvolution);

export default router;
