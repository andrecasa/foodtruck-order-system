import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicOrderResponse } from '@order-system/shared';
import { fetchPublicOrder } from '../../services/public-client';
import { useRealtime, type RealtimeEvent } from '../useRealtime';

/** Realtime event names broadcast by the backend on the queue channel. */
const STATUS_UPDATED_EVENT = 'status_updated';
const PAYMENT_REGISTERED_EVENT = 'payment_registered';
/** Polling fallback interval (design: 30s). */
const POLL_INTERVAL_MS = 30_000;

export interface UsePublicOrdersTrackingResult {
  /** Fetched orders keyed by id (missing while loading / on per-order failure). */
  ordersById: Record<string, PublicOrderResponse>;
  /** True until the first fetch of the full id set resolves. */
  isLoading: boolean;
  /** Re-fetches every order id. */
  refetch: () => void;
}

/**
 * Tracks MANY public orders at once (the customer "Meus Pedidos" list).
 *
 * Fetches each id via `fetchPublicOrder`, then keeps them fresh with realtime
 * `status_updated` / `payment_registered` events on the tenant channel when
 * connected, falling back to 30s polling otherwise. Per-order fetch failures
 * are ignored so one bad id doesn't blank the whole list.
 *
 * `orderIds` is treated as a set; its ORDER does not matter here — the screen
 * decides display order (newest first from the session list).
 */
export function usePublicOrdersTracking(
  slug: string | undefined,
  orderIds: string[],
  realtimeChannel: string | null,
): UsePublicOrdersTrackingResult {
  const [ordersById, setOrdersById] = useState<Record<string, PublicOrderResponse>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Stable key so effects re-run only when the id SET changes (not on every
  // array identity change).
  const idsKey = [...orderIds].sort().join(',');

  const loadOne = useCallback(
    async (orderId: string) => {
      if (!slug) return;
      try {
        const result = await fetchPublicOrder(slug, orderId);
        setOrdersById((prev) => ({ ...prev, [orderId]: result }));
      } catch {
        // Ignore per-order failures — keep any previously loaded value.
      }
    },
    [slug],
  );

  const loadAll = useCallback(
    async (isInitial: boolean) => {
      if (!slug || orderIds.length === 0) {
        setIsLoading(false);
        return;
      }
      if (isInitial) setIsLoading(true);
      await Promise.all(orderIds.map((id) => loadOne(id)));
      if (isInitial) setIsLoading(false);
    },
    // orderIds intentionally excluded; idsKey drives re-runs.
    [slug, idsKey, loadOne], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    loadAll(true);
  }, [loadAll]);

  // Track the current id set in a ref so the realtime handler only applies
  // events for orders we're actually displaying.
  const idsRef = useRef<Set<string>>(new Set(orderIds));
  idsRef.current = new Set(orderIds);

  const handleEvent = useCallback((event: RealtimeEvent) => {
    const payload = event.payload as
      | { id?: string; status?: string; paymentStatus?: string }
      | undefined;
    if (!payload?.id || !idsRef.current.has(payload.id)) return;

    if (event.event === STATUS_UPDATED_EVENT && typeof payload.status === 'string') {
      setOrdersById((prev) => {
        const existing = prev[payload.id as string];
        if (!existing || existing.status === payload.status) return prev;
        return { ...prev, [payload.id as string]: { ...existing, status: payload.status as string } };
      });
      return;
    }

    if (event.event === PAYMENT_REGISTERED_EVENT && typeof payload.paymentStatus === 'string') {
      setOrdersById((prev) => {
        const existing = prev[payload.id as string];
        if (!existing) return prev;
        return {
          ...prev,
          [payload.id as string]: { ...existing, paymentStatus: payload.paymentStatus as string },
        };
      });
    }
  }, []);

  const { status: realtimeStatus } = useRealtime({
    channels: realtimeChannel ? [realtimeChannel] : [],
    onEvent: handleEvent,
    onReconnect: () => loadAll(false),
    enabled: !!realtimeChannel && !!slug && orderIds.length > 0,
  });

  // Polling fallback — only when realtime is not the active transport.
  const hasRealtime = !!realtimeChannel && !!slug && orderIds.length > 0;
  const isRealtimeConnected = hasRealtime && realtimeStatus === 'connected';

  useEffect(() => {
    if (!slug || orderIds.length === 0) return;
    if (isRealtimeConnected) return;
    const timer = setInterval(() => loadAll(false), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [slug, idsKey, loadAll, isRealtimeConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ordersById, isLoading, refetch: () => loadAll(true) };
}
