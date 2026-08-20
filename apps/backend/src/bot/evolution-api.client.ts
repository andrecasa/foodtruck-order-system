/**
 * Evolution API HTTP client for sending WhatsApp messages.
 *
 * The WhatsApp gateway is multi-tenant: each tenant has its own Evolution
 * instance (see design section 6 "WhatsApp por Tenant"). The instance name is
 * resolved from the tenant's `evolution_instance_name` and passed per call.
 *
 * The global `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` env vars remain as shared
 * platform-level configuration for the base URL and API key. The global
 * `EVOLUTION_INSTANCE_NAME` is kept only as a last-resort fallback for callers
 * that have not yet been refactored to pass a tenant instance name.
 */

const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || 'change-me-evolution-api-key';

/**
 * Fallback instance name used only when a caller does not supply a tenant's
 * `evolution_instance_name`. Per-call instance names take precedence.
 */
const DEFAULT_EVOLUTION_INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'order-system';

export interface SendTextOptions {
  number: string;
  text: string;
  /**
   * The tenant's Evolution instance name (`tenants.evolution_instance_name`).
   * When provided, the message is sent through this instance. When omitted,
   * the global fallback instance is used to preserve backward compatibility.
   */
  instanceName?: string;
}

/**
 * Send a text message via Evolution API.
 *
 * Resolves the target Evolution instance from `options.instanceName` (the
 * tenant's instance) and falls back to the global instance when not provided.
 */
export async function sendTextMessage(options: SendTextOptions): Promise<void> {
  const instanceName = options.instanceName || DEFAULT_EVOLUTION_INSTANCE_NAME;
  const url = `${EVOLUTION_API_URL}/message/sendText/${instanceName}`;

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

/**
 * Options for provisioning a tenant's Evolution instance and webhook.
 */
export interface ProvisionInstanceOptions {
  /** The tenant's unique Evolution instance name (`tenants.evolution_instance_name`). */
  instanceName: string;
  /** The public URL the Evolution API should POST webhook events to. */
  webhookUrl: string;
}

/**
 * Provisions a new Evolution instance for a tenant and configures its webhook
 * to point at the platform's `/api/webhook/evolution` endpoint (Requirement
 * 9.4).
 *
 * This performs a network side-effect against the Evolution API. It is invoked
 * INSIDE the onboarding flow AFTER the database inserts; if it throws, the
 * caller rolls back the database transaction so no partially-provisioned tenant
 * remains (Requirement 9.7 — Correctness Property 6).
 *
 * NOTE: this is deliberately a thin, side-effecting function so it can be
 * injected/mocked in unit tests and in environments where the real Evolution
 * API is not reachable (see `provisionTenant`'s `evolution` dependency).
 *
 * @throws Error when the Evolution API responds with a non-OK status or the
 *         request fails, so the caller can trigger a full rollback.
 */
export async function provisionEvolutionInstance(options: ProvisionInstanceOptions): Promise<void> {
  const url = `${EVOLUTION_API_URL}/instance/create`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instanceName: options.instanceName,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        url: options.webhookUrl,
        webhook_by_events: false,
        events: ['MESSAGES_UPSERT'],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `[evolution-api] Failed to provision instance "${options.instanceName}": ${response.status} ${response.statusText}`,
    );
  }
}
