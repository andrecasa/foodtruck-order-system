/**
 * WhatsApp Webhook Controller / Webhook Router - Handles incoming Evolution API webhooks.
 *
 * Multi-tenant routing (design section 6 "WhatsApp por Tenant", WebhookRouter):
 * The Evolution webhook payload carries an `instance` field identifying which
 * Evolution instance emitted the event. Each tenant owns exactly one Evolution
 * instance, mapped through the UNIQUE column `tenants.evolution_instance_name`.
 * This controller resolves the tenant from that instance and processes the
 * message in the background under the resolved `tenantId`.
 *
 * Always-200 contract (Requirements 8.3, 8.4, 8.5, 8.6):
 * The router NEVER creates or mutates data on error paths and ALWAYS responds
 * HTTP 200 (in <= 10s) for:
 *   - unknown instance (no tenant maps to it)          -> R8.3
 *   - malformed payload / missing `instance`           -> R8.4
 *   - any unexpected internal error                    -> R8.5
 * The previous 500 response on unexpected errors is replaced by a 200.
 *
 * Tenant resolution here is platform/routing level (it runs before any tenant
 * scope is established), so querying the shared `pool` directly is acceptable
 * in the router — unlike domain services, which must go through the
 * TenantRepository.
 */

import { type Request, type Response } from 'express';
import { pool } from '../config/database.js';
import { handleIncomingMessage } from './whatsapp.service.js';

const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'change-me-evolution-api-key';

/**
 * Resolve a tenant id from an Evolution instance name via the UNIQUE
 * `tenants.evolution_instance_name` mapping.
 *
 * Returns the `tenantId` when exactly one active-or-any tenant matches, or
 * `null` when the instance is unknown / not associated with any tenant (R8.3).
 * Never throws to callers on the routing happy-path check — errors are handled
 * by the caller so the webhook can still respond 200 (R8.5).
 */
export async function resolveTenantIdByInstance(instanceName: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    'SELECT id FROM tenants WHERE evolution_instance_name = $1 LIMIT 1',
    [instanceName]
  );
  return result.rows.length > 0 ? result.rows[0]!.id : null;
}

/**
 * POST /api/webhook/evolution
 * Receives webhook events from Evolution API.
 *
 * Validates the API Key header (mismatch -> 401). Beyond auth, every other
 * outcome — including unknown instance, malformed payload, and unexpected
 * internal errors — resolves to HTTP 200 with no data side effects.
 */
export async function webhookEvolution(req: Request, res: Response): Promise<void> {
  // API Key validation stays as a 401 gate (kept from the MVP contract).
  const apiKey = req.headers['apikey'];
  if (apiKey !== EVOLUTION_API_KEY) {
    res.status(401).json({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'API Key inválida',
    });
    return;
  }

  try {
    const body = req.body;

    // --- Malformed payload / missing instance -> 200, no side effects (R8.4) ---
    if (!body || typeof body !== 'object') {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const instance = body.instance;
    if (typeof instance !== 'string' || instance.trim() === '') {
      // No instance identifier in the payload: ignore, do not touch data (R8.4).
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // --- Resolve the tenant from the Evolution instance (R8.2) ---
    const tenantId = await resolveTenantIdByInstance(instance);
    if (!tenantId) {
      // Unknown instance: no tenant associated -> ignore, no side effects (R8.3).
      res.status(200).json({ status: 'ignored' });
      return;
    }

    const { event, data } = body;

    // Only handle incoming messages; anything else is acknowledged with 200.
    if (event !== 'messages.upsert') {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Ignore messages sent by us (fromMe).
    if (data?.key?.fromMe) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Extract message data.
    const remoteJid = data?.key?.remoteJid;
    const pushName = data?.pushName;
    const messageText = data?.message?.conversation
      || data?.message?.extendedTextMessage?.text
      || '';

    if (!remoteJid || !messageText) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Extract phone number from JID (format: 5511999999999@s.whatsapp.net).
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');

    // Respond immediately (well within the 10s budget, R8.6) and process the
    // message in the background under the resolved tenant (fire-and-forget).
    res.status(200).json({ status: 'received' });

    handleIncomingMessage(tenantId, phoneNumber, pushName, messageText).catch((error) => {
      console.error('[whatsapp-webhook] Error handling message:', error);
    });
  } catch (error) {
    // Unexpected internal error: never persist partial data, always answer 200
    // (R8.5). This replaces the previous 500 response.
    console.error('[whatsapp-webhook] Unexpected error:', error);
    if (!res.headersSent) {
      res.status(200).json({ status: 'ignored' });
    }
  }
}
