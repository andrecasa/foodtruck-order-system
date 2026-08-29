import { useCallback, useState } from 'react';
import type { PublicOrderResponse } from '@order-system/shared';
import {
  createPublicOrder,
  type CreatePublicOrderBody,
} from '../../services/public-client';

export interface UseCreateOrderResult {
  /**
   * Submits the order to the public API. Resolves with the created order on
   * success, or `null` on failure (the error is exposed via `error`). Never
   * throws, so callers can `await` it and branch on the result.
   */
  submit: (body: CreatePublicOrderBody) => Promise<PublicOrderResponse | null>;
  /** True while the request is in flight. */
  isSubmitting: boolean;
  /** Friendly error message from the last failed attempt, or null. */
  error: string | null;
  /** Clears the current error (e.g. before a retry). */
  reset: () => void;
}

/**
 * Creates a public (origin 'web') order for a tenant slug.
 *
 * Wraps `createPublicOrder` with loading/error state for the checkout screen.
 * On failure it surfaces a friendly message and returns `null` — it deliberately
 * does NOT clear the cart, so the caller can offer a retry (Requirement 7.7).
 */
export function useCreateOrder(slug: string | undefined): UseCreateOrderResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (body: CreatePublicOrderBody): Promise<PublicOrderResponse | null> => {
      if (!slug) {
        setError('Estabelecimento não encontrado.');
        return null;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const order = await createPublicOrder(slug, body);
        return order;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Não foi possível enviar o pedido. Tente novamente.',
        );
        return null;
      } finally {
        setIsSubmitting(false);
      }
    },
    [slug],
  );

  const reset = useCallback(() => setError(null), []);

  return { submit, isSubmitting, error, reset };
}
