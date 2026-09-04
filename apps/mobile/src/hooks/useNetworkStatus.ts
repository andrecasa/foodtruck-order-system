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
let appStateSubscription: { remove: () => void } | null = null;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

function setOffline(value: boolean) {
  if (value === isOfflineState) return;
  // Monitoring may have been torn down while an async check was in flight;
  // don't schedule new timers in that case.
  if (!initialized) return;

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

/**
 * Derives an offline flag from an expo-network state, tolerating Android's
 * unreliable `isInternetReachable`.
 *
 * On Android, `getNetworkStateAsync()` frequently returns `isInternetReachable`
 * as `undefined`/`null` (and sometimes `false`) even when the device clearly has
 * a working connection (expo/expo#6338, #33070). Treating those non-`false`
 * values as offline produced false positives that broke the UI (e.g. the login
 * screen collapsing into the offline empty state).
 *
 * We now only consider the device offline when connectivity is explicitly
 * negative: `isConnected === false`, or `isInternetReachable === false` while
 * still connected. Unknown reachability (`undefined`/`null`) is treated as
 * online.
 */
function deriveOffline(state: Network.NetworkState): boolean {
  if (state.isConnected === false) return true;
  return state.isInternetReachable === false;
}

async function checkNetwork() {
  try {
    const state = await Network.getNetworkStateAsync();
    // The interval may have been cleared while awaiting; ignore late results.
    if (!initialized) return;
    setOffline(deriveOffline(state));
  } catch {
    // Can't check — don't change state
  }
}

function startMonitoring() {
  if (initialized) return;
  initialized = true;

  // Initial check (immediate, no debounce for first check)
  Network.getNetworkStateAsync().then((state) => {
    // Ignore if monitoring was torn down before this resolved.
    if (!initialized) return;
    const offline = deriveOffline(state);
    if (offline !== isOfflineState) {
      isOfflineState = offline;
      notify();
    }
  }).catch(() => {});

  // Periodic check every 15s
  intervalId = setInterval(checkNetwork, 15000);

  // Check on app foreground
  appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      checkNetwork();
    }
  });
}

/**
 * Tears down all monitoring side effects. Called when the last subscriber
 * unsubscribes so the singleton leaves no timers or listeners running (avoids
 * leaks in tests and when the app fully unmounts).
 */
function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  initialized = false;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  startMonitoring();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopMonitoring();
    }
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
