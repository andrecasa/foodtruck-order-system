/**
 * Evolution API HTTP client for sending WhatsApp messages.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'change-me-evolution-api-key';
const EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'order-system';

export interface SendTextOptions {
  number: string;
  text: string;
}

/**
 * Send a text message via Evolution API.
 */
export async function sendTextMessage(options: SendTextOptions): Promise<void> {
  const url = `${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE_NAME}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number: options.number,
        text: options.text,
      }),
    });

    if (!response.ok) {
      console.error(`[evolution-api] Failed to send message: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('[evolution-api] Error sending message:', error);
  }
}
