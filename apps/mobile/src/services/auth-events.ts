/**
 * Simple event emitter for auth-related events.
 * Used to notify the AuthProvider when a 401 is received from the API,
 * triggering a redirect to the login screen.
 */

type Listener = () => void;

const listeners: Set<Listener> = new Set();

export const authEvents = {
  /** Subscribe to session expiration events. Returns an unsubscribe function. */
  onSessionExpired(listener: Listener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  /** Emit a session expired event (called by authFetch on 401). */
  emitSessionExpired(): void {
    listeners.forEach((fn) => fn());
  },
};
