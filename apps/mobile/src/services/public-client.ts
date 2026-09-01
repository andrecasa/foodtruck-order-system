import type {
  PublicBranding,
  PublicMenuCategory,
  PublicOrderResponse,
} from '@order-system/shared';
import { NetworkError } from './real-client';

/**
 * Client for the public customer-ordering endpoints (`/api/public/:slug/...`).
 *
 * Unlike `real-client.ts`, these calls carry NO Authorization header — the
 * backend resolves the tenant from the `:slug` in the URL, so the customer flow
 * works without login. The base URL follows the same `EXPO_PUBLIC_API_URL`
 * convention as `real-client.ts`.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

/** Body accepted by the public create-order endpoint (mirrors publicCreateOrderSchema). */
export interface CreatePublicOrderBody {
  customerName: string;
  items: { menuItemId: string; quantity: number }[];
}

/**
 * Performs an unauthenticated fetch against the public API and returns the
 * parsed JSON. Throws NetworkError with the backend status code on failure so
 * callers can distinguish 404 (tenant/order not found) from other errors.
 */
async function publicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    // Request never reached the server (offline, unreachable host, DNS, etc.).
    throw new NetworkError(
      'Não foi possível conectar ao servidor. Verifique sua conexão.',
      0,
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new NetworkError(
      (body as { message?: string; error?: string }).message ||
        (body as { error?: string }).error ||
        `Erro ${response.status}`,
      response.status,
    );
  }

  return response.json() as Promise<T>;
}

/** Fetches the public branding for a tenant slug (no token). */
export function fetchPublicBranding(slug: string): Promise<PublicBranding> {
  return publicFetch<PublicBranding>(`/api/public/${encodeURIComponent(slug)}/branding`);
}

/** Fetches the public menu (categories with active items) for a tenant slug (no token). */
export function fetchPublicMenu(slug: string): Promise<PublicMenuCategory[]> {
  return publicFetch<PublicMenuCategory[]>(`/api/public/${encodeURIComponent(slug)}/menu`);
}

/** Creates a public (origin 'web') order for a tenant slug (no token). */
export function createPublicOrder(
  slug: string,
  body: CreatePublicOrderBody,
): Promise<PublicOrderResponse> {
  return publicFetch<PublicOrderResponse>(`/api/public/${encodeURIComponent(slug)}/orders`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Fetches the current status of a public order (no token). */
export function fetchPublicOrder(
  slug: string,
  orderId: string,
): Promise<PublicOrderResponse> {
  return publicFetch<PublicOrderResponse>(
    `/api/public/${encodeURIComponent(slug)}/orders/${encodeURIComponent(orderId)}`,
  );
}

/**
 * Fetches many public orders in ONE request (no token), for the "Meus Pedidos"
 * list. Follows the operator listing convention: a GET with a comma-separated
 * `ids` query param. Returns the found orders (unknown ids are omitted server
 * side). Returns an empty array when no ids are given, without a network call.
 */
export function fetchPublicOrders(
  slug: string,
  orderIds: string[],
): Promise<PublicOrderResponse[]> {
  if (orderIds.length === 0) return Promise.resolve([]);
  const params = new URLSearchParams();
  params.set('ids', orderIds.join(','));
  return publicFetch<PublicOrderResponse[]>(
    `/api/public/${encodeURIComponent(slug)}/orders?${params.toString()}`,
  );
}
