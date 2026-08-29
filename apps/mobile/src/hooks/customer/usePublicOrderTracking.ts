import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicOrderResponse } from '@order-system/shared';
import { fetchPublicOrder } from '../../services/public-client';
import { NetworkError } from '../../services/real-client';
import { useRealtime, type RealtimeEvent } from '../useRealtime';

/** Realtime event name broadcast by the backend when an order's status changes. */
const STATUS_UPDATED_EVENT = 'status_updated';
/** Realtime event name broadcast (on the queue channel) when payment is registered. */
const PAYMENT_REGISTERED_EVENT = 'payment_registered';
/** Polling fallback interval (Requirement 7.4 / design: 30s). */
const POLL_INTERVAL_MS = 30_000;

export interface UsePublicOrderTrackingResult {
  /** The tracked order (initial fetch + realtime/polling updates), or null while loading. */
  order: PublicOrderResponse | null;
  /** True during the initial fetch only. */
  isLoading: boolean;
  /** Error from the initial fetch. `notFound` is true for a 404. */
  error: { notFound: boolean; message: string } | null;
  /** Manually re-fetches the order (retry button). */
  refetch: () => void;
}

/**
 * Tracks a public order's status in real time.
 *
 * 1. Initial fetch via `fetchPublicOrder(slug, orderId)`.
 * 2. Subscribes to the tenant realtime channel (name from branding →
 *    `realtimeChannel`) reusing the shared `useRealtime` hook, and applies
 *    `status_updated` events whose `payload.id === orderId`.
 * 3. Polls every 30s ONLY as a fallback — when there is no realtime channel or
 *    the socket is not connected. While the socket is connected, no periodic
 *    HTTP requests are made.
 *
 * Works after a page reload because `orderId` comes from the route params.
 */
export function usePublicOrderTracking(
  slug: string | undefined,
  orderId: string | undefined,
  realtimeChannel: string | null,
): UsePublicOrderTrackingResult {
  const [order, setOrder] = useState<PublicOrderResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);

  // Keep the latest status in a ref so realtime/polling handlers avoid stale reads.
  const statusRef = useRef<string | null>(null);

  const load = useCallback(
    async (isInitial: boolean) => {
      if (!slug || !orderId) {
        setIsLoading(false);
        setError({ notFound: true, message: 'Pedido não encontrado.' });
        return;
      }

      if (isInitial) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const result = await fetchPublicOrder(slug, orderId);
        statusRef.current = result.status;
        setOrder(result);
        if (isInitial) setError(null);
      } catch (err) {
        if (isInitial) {
          const status = err instanceof NetworkError ? err.statusCode : undefined;
          if (status === 404 || status === 400) {
            setError({ notFound: true, message: 'Pedido não encontrado.' });
          } else {
            setError({
              notFound: false,
              message:
                err instanceof Error
                  ? err.message
                  : 'Não foi possível carregar o pedido.',
            });
          }
        }
        // Polling failures are silent — realtime or the next poll may recover.
      } finally {
        if (isInitial) setIsLoading(false);
      }
    },
    [slug, orderId],
  );

  // Initial fetch (re-runs if slug/orderId change).
  useEffect(() => {
    load(true);
  }, [load]);

  // ─── Realtime: apply status_updated events for this order ──────────────────

  const handleEvent = useCallback(
    (event: RealtimeEvent) => {
      const payload = event.payload as
        | { id?: string; status?: string; paymentStatus?: string }
        | undefined;
      if (!payload || payload.id !== orderId) return;

      // Order status change.
      if (event.event === STATUS_UPDATED_EVENT && typeof payload.status === 'string') {
        if (payload.status === statusRef.current) return;
        statusRef.current = payload.status;
        setOrder((prev) => (prev ? { ...prev, status: payload.status as string } : prev));
        return;
      }

      // Payment registered (lightweight event on the queue channel).
      if (
        event.event === PAYMENT_REGISTERED_EVENT &&
        typeof payload.paymentStatus === 'string'
      ) {
        setOrder((prev) =>
          prev ? { ...prev, paymentStatus: payload.paymentStatus as string } : prev,
        );
      }
    },
    [orderId],
  );

  const { status: realtimeStatus } = useRealtime({
    channels: realtimeChannel ? [realtimeChannel] : [],
    onEvent: handleEvent,
    // On (re)connect, re-sync in case an event was missed while disconnected.
    onReconnect: () => load(false),
    enabled: !!realtimeChannel && !!slug && !!orderId,
  });

  // ─── Polling FALLBACK (every 30s) ──────────────────────────────────────────
  //
  // Polling only runs when realtime is NOT the active transport — i.e. there is
  // no channel to subscribe to, or the socket is disconnected/reconnecting.
  // While the socket is 'connected', status updates arrive via `status_updated`
  // events and we make NO periodic HTTP calls (the socket is the source of
  // truth). This prevents the tracking screen from hitting
  // `/orders/:orderId` on a timer while realtime is healthy.

  const hasRealtime = !!realtimeChannel && !!slug && !!orderId;
  const isRealtimeConnected = hasRealtime && realtimeStatus === 'connected';

  useEffect(() => {
    if (!slug || !orderId) return;
    // Socket is healthy → rely on realtime, no polling.
    if (isRealtimeConnected) return;

    const timer = setInterval(() => load(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slug, orderId, load, isRealtimeConnected]);

  return { order, isLoading, error, refetch: () => load(true) };
}
