import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Singleton network status manager.
 * Checks connectivity periodically and on app foreground.
 * Uses debounce (2s) to avoid flicker from transient network state changes.
 */

let isOfflineState = false;
let listeners = new Set<() => void>();
let initialized = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function setOffline(value: boolean) {
  if (value === isOfflineState) return;

  // Debounce: only commit the change after 2s of stable state
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    if (value !== isOfflineState) {
      isOfflineState = value;
      notify();
    }
  }, value ? 2000 : 500); // 2s to go offline (avoid flicker), 500ms to go online (fast recovery)
}

async function checkNetwork() {
  try {
    const state = await Network.getNetworkStateAsync();
    const offline = !state.isConnected || !state.isInternetReachable;
    setOffline(offline);
  } catch {
    // Can't check — don't change state
  }
}

function startMonitoring() {
  if (initialized) return;
  initialized = true;

  // Initial check (immediate, no debounce for first check)
  Network.getNetworkStateAsync().then((state) => {
    const offline = !state.isConnected || !state.isInternetReachable;
    if (offline !== isOfflineState) {
      isOfflineState = offline;
      notify();
    }
  }).catch(() => {});

  // Periodic check every 15s
  intervalId = setInterval(checkNetwork, 15000);

  // Check on app foreground
  AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      checkNetwork();
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startMonitoring();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return isOfflineState;
}

/**
 * Hook that monitors network connectivity.
 * Returns `{ isOffline }` — shared across all components using this hook.
 * Uses debounce to prevent flicker from transient state changes.
 */
export function useNetworkStatus() {
  const isOffline = useSyncExternalStore(subscribe, getSnapshot);
  return { isOffline };
}
