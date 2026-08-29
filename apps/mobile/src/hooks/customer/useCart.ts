import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import type { PublicMenuItem } from '@order-system/shared';

/** A single line in the cart: the menu item plus the selected quantity. */
export interface CartItem {
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

export interface UseCartResult {
  items: CartItem[];
  /** Adds `qty` (default 1) of an item, merging with an existing line. */
  addItem: (item: PublicMenuItem, qty?: number) => void;
  /** Removes a line entirely. */
  removeItem: (menuItemId: string) => void;
  /** Sets the quantity of a line; qty <= 0 removes it. */
  updateQuantity: (menuItemId: string, qty: number) => void;
  /** Empties the cart. */
  clear: () => void;
  /** Total price in centavos. */
  total: number;
  /** Total number of individual units across all lines. */
  count: number;
}

/**
 * Minimal platform-abstracted synchronous storage.
 *
 * On web, uses `sessionStorage` — the cart persists across navigation within
 * the tab but is lost when the tab closes (intentional, avoids "ghost" orders).
 * On native (no session concept for the customer flow), falls back to an
 * in-memory map so the hook stays platform-agnostic.
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
  return `cart:${slug ?? 'unknown'}`;
}

function readPersistedItems(slug: string | undefined): CartItem[] {
  try {
    const raw = getStorage().getItem(storageKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        i &&
        typeof i.menuItemId === 'string' &&
        typeof i.name === 'string' &&
        typeof i.priceCents === 'number' &&
        typeof i.quantity === 'number',
    );
  } catch {
    return [];
  }
}

/**
 * Cart state for the customer ordering flow, keyed by tenant slug.
 *
 * State lives in `useState` and is mirrored to platform-abstracted storage
 * (`sessionStorage` on web, in-memory otherwise) under the key `cart:{slug}`.
 * All mutations are synchronous — there is no backend involved.
 */
export function useCart(slug: string | undefined): UseCartResult {
  const [items, setItems] = useState<CartItem[]>(() => readPersistedItems(slug));

  // Re-hydrate when the slug changes (e.g. navigating between establishments).
  const slugRef = useRef(slug);
  useEffect(() => {
    if (slugRef.current !== slug) {
      slugRef.current = slug;
      setItems(readPersistedItems(slug));
    }
  }, [slug]);

  // Persist whenever items change.
  useEffect(() => {
    try {
      const key = storageKey(slug);
      if (items.length === 0) {
        getStorage().removeItem(key);
      } else {
        getStorage().setItem(key, JSON.stringify(items));
      }
    } catch {
      // Storage unavailable (private mode, quota) — cart still works in memory.
    }
  }, [items, slug]);

  const addItem = useCallback((item: PublicMenuItem, qty = 1) => {
    if (qty <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.id);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === item.id ? { ...i, quantity: i.quantity + qty } : i,
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          priceCents: item.priceCents,
          quantity: qty,
        },
      ];
    });
  }, []);

  const removeItem = useCallback((menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItemId !== menuItemId));
  }, []);

  const updateQuantity = useCallback((menuItemId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((i) => i.menuItemId !== menuItemId);
      }
      return prev.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: qty } : i));
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const total = useMemo(
    () => items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0),
    [items],
  );

  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  return { items, addItem, removeItem, updateQuantity, clear, total, count };
}
