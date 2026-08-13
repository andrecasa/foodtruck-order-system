/**
 * WhatsApp Webhook Controller - Handles incoming Evolution API webhooks.
 */

import { Request, Response } from 'express';
import { handleIncomingMessage } from './whatsapp.service.js';

const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'change-me-evolution-api-key';

/**
 * POST /api/webhook/evolution
 * Receives webhook events from Evolution API.
 * Validates API Key header before processing.
 */
export async function webhookEvolution(req: Request, res: Response): Promise<void> {
  try {
    // Validate API Key
    const apiKey = req.headers['apikey'];
    if (apiKey !== EVOLUTION_API_KEY) {
      res.status(401).json({
        statusCode: 401,
        error: 'UNAUTHORIZED',
        message: 'API Key inválida',
      });
      return;
    }

    const { event, data } = req.body;

    // Only handle incoming messages
    if (event !== 'messages.upsert') {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Ignore messages sent by us (fromMe)
    if (data?.key?.fromMe) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Extract message data
    const remoteJid = data?.key?.remoteJid;
    const pushName = data?.pushName;
    const messageText = data?.message?.conversation
      || data?.message?.extendedTextMessage?.text
      || '';

    if (!remoteJid || !messageText) {
      res.status(200).json({ status: 'ignored' });
      return;
    }

    // Extract phone number from JID (format: 5511999999999@s.whatsapp.net)
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');

    // Process message asynchronously (don't block webhook response)
    // We respond immediately to Evolution API
    res.status(200).json({ status: 'received' });

    // Handle the message (fire and forget to not block the webhook)
    handleIncomingMessage(phoneNumber, pushName, messageText).catch((error) => {
      console.error('[whatsapp-webhook] Error handling message:', error);
    });
  } catch (error) {
    console.error('[whatsapp-webhook] Unexpected error:', error);
    res.status(500).json({
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'Erro interno no webhook.',
    });
  }
}
