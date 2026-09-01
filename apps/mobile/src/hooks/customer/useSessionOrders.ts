import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** Lightweight summary of a placed order, enough to render a list entry. */
export interface SessionOrder {
  id: string;
  dailyNumber: number;
  customerName: string;
  /**
   * Last known order status ('aguardando' | 'preparando' | 'pronto' |
   * 'entregue'). Optional for backward compat with entries persisted before
   * this field existed. Used to color the "Meus pedidos" list.
   */
  status?: string;
}

/**
 * Remembers the orders a customer placed for a tenant during THIS session, so
 * the "Meus Pedidos" screen can list them (oldest first).
 *
 * Scope is intentionally session-only:
 *   - Web: `sessionStorage` under `orders:{slug}` — survives navigation and
 *     reloads within the tab, and is cleared when the tab closes (matching the
 *     cart's lifetime; no long-lived history without login).
 *   - Native: in-memory fallback (the customer flow has no session concept
 *     there), keeping the hook platform-agnostic.
 *
 * Only a small summary is stored; the full order is fetched by id when needed.
 */
interface SyncStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const memoryStore = new Map<string, string>();
const inMemoryStorage: SyncStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key)! : null),
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  },
};

function getStorage(): SyncStorage {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    return sessionStorage;
  }
  return inMemoryStorage;
}

function storageKey(slug: string | undefined): string {
  return `orders:${slug ?? 'unknown'}`;
}

function isSessionOrder(value: unknown): value is SessionOrder {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as SessionOrder).id === 'string' &&
    typeof (value as SessionOrder).dailyNumber === 'number' &&
    typeof (value as SessionOrder).customerName === 'string'
  );
}

function readOrders(slug: string | undefined): SessionOrder[] {
  try {
    const raw = getStorage().getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionOrder);
  } catch {
    return [];
  }
}

export interface UseSessionOrdersResult {
  /** Orders placed this session for the tenant, oldest first (order of placement). */
  orders: SessionOrder[];
  /**
   * Records a placed order (dedupes by id; existing entries are updated in
   * place). New orders are appended at the end so the list stays in the
   * chronological order they were placed (oldest first).
   */
  addOrder: (order: SessionOrder) => void;
  /**
   * Updates the cached status of a single order (by id) if it is in the list.
   * No-op when the order is not part of this session. Used to reflect realtime
   * `status_updated` events on the cardápio list.
   */
  updateStatus: (orderId: string, status: string) => void;
  /** Clears the session order list for this tenant. */
  clearOrders: () => void;
  /**
   * Re-reads the persisted list from storage. Call this when the cardápio
   * regains focus: it may stay mounted while an order is placed elsewhere, so
   * its initial state would otherwise be stale.
   */
  refresh: () => void;
}

export function useSessionOrders(slug: string | undefined): UseSessionOrdersResult {
  const [orders, setOrders] = useState<SessionOrder[]>(() => readOrders(slug));

  // Re-hydrate when the tenant changes.
  const slugRef = useRef(slug);
  useEffect(() => {
    if (slugRef.current !== slug) {
      slugRef.current = slug;
      setOrders(readOrders(slug));
    }
  }, [slug]);

  const persist = useCallback(
    (next: SessionOrder[]) => {
      try {
        const key = storageKey(slug);
        if (next.length === 0) {
          getStorage().removeItem(key);
        } else {
          getStorage().setItem(key, JSON.stringify(next));
        }
      } catch {
        // Storage unavailable — list still held in state.
      }
    },
    [slug],
  );

  const addOrder = useCallback(
    (order: SessionOrder) => {
      // The storage is the SHARED source of truth across hook instances (the
      // cardápio and each screen each have their own useState). Merge against
      // the CURRENT persisted list — NOT this instance's possibly-stale
      // `prev` — so recording order #2 from a freshly-mounted screen does not
      // overwrite order #1 that another instance persisted.
      //
      // Append at the END so the list stays in placement order (oldest first);
      // a re-recorded id keeps its original position rather than jumping.
      const current = readOrders(slug);
      const withoutDupe = current.filter((o) => o.id !== order.id);
      const next = [...withoutDupe, order];
      persist(next);
      setOrders(next);
    },
    [persist, slug],
  );

  const updateStatus = useCallback(
    (orderId: string, status: string) => {
      // Merge against the current persisted list (shared source of truth).
      const current = readOrders(slug);
      const existing = current.find((o) => o.id === orderId);
      if (!existing || existing.status === status) return; // not ours / unchanged
      const next = current.map((o) => (o.id === orderId ? { ...o, status } : o));
      persist(next);
      setOrders(next);
    },
    [persist, slug],
  );

  const clearOrders = useCallback(() => {
    persist([]);
    setOrders([]);
  }, [persist]);

  const refresh = useCallback(() => {
    setOrders(readOrders(slug));
  }, [slug]);

  return { orders, addOrder, updateStatus, clearOrders, refresh };
}
