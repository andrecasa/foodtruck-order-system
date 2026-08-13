import { useCallback, useRef, useState } from 'react';
import { NetworkError } from '../services/real-client';

interface NetworkErrorState {
  message: string | null;
  visible: boolean;
}

interface UseNetworkErrorReturn {
  /** Current error toast state */
  error: NetworkErrorState;
  /** Dismiss the error toast */
  dismiss: () => void;
  /**
   * Wraps an async operation with retry logic and error display.
   * Retries up to `maxRetries` times on network errors (non-4xx).
   * Shows a toast message on failure.
   */
  withRetry: <T>(
    fn: () => Promise<T>,
    options?: { maxRetries?: number; retryDelay?: number },
  ) => Promise<T | undefined>;
}

/**
 * Hook for handling network errors with retry logic and toast notifications.
 *
 * Usage:
 * ```
 * const { error, dismiss, withRetry } = useNetworkError();
 *
 * await withRetry(() => apiClient.getOrders());
 * ```
 */
export function useNetworkError(): UseNetworkErrorReturn {
  const [error, setError] = useState<NetworkErrorState>({ message: null, visible: false });
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((message: string) => {
    setError({ message, visible: true });

    // Auto-dismiss after 4 seconds
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = setTimeout(() => {
      setError((prev) => ({ ...prev, visible: false }));
    }, 4000);
  }, []);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
    }
    setError({ message: null, visible: false });
  }, []);

  const withRetry = useCallback(
    async <T>(
      fn: () => Promise<T>,
      options?: { maxRetries?: number; retryDelay?: number },
    ): Promise<T | undefined> => {
      const maxRetries = options?.maxRetries ?? 2;
      const retryDelay = options?.retryDelay ?? 1000;

      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (err) {
          lastError = err;

          // Don't retry on client errors (4xx)
          if (err instanceof NetworkError && err.statusCode >= 400 && err.statusCode < 500) {
            break;
          }

          // Wait before retrying (except on last attempt)
          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
          }
        }
      }

      // All retries failed — show error
      const message =
        lastError instanceof NetworkError
          ? lastError.message
          : lastError instanceof Error
            ? lastError.message
            : 'Erro de conexão. Verifique sua rede.';

      showError(message);
      return undefined;
    },
    [showError],
  );

  return { error, dismiss, withRetry };
}
