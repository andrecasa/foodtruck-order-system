import { useCallback, useEffect, useState } from 'react';
import type { PublicBranding } from '@order-system/shared';
import { fetchPublicBranding } from '../../services/public-client';
import { NetworkError } from '../../services/real-client';

export interface UsePublicBrandingResult {
  /** Resolved branding, or null while loading / on error. */
  branding: PublicBranding | null;
  /** Realtime channel name provided by the branding endpoint (or null). */
  realtimeChannel: string | null;
  isLoading: boolean;
  /** Error state. `notFound` is true when the slug resolved to a 404 (tenant não encontrado). */
  error: { notFound: boolean; message: string } | null;
  /** Refetches the branding (e.g. from a retry button). */
  refetch: () => void;
}

/**
 * Resolves the public branding for a tenant slug (no authentication).
 *
 * Used by the `(public)` layout to apply the tenant theme before rendering the
 * customer screens. A 404 from the backend is surfaced as `error.notFound` so
 * the layout can show a dedicated "Estabelecimento não encontrado" screen.
 */
export function usePublicBranding(slug: string | undefined): UsePublicBrandingResult {
  const [branding, setBranding] = useState<PublicBranding | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ notFound: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    if (!slug) {
      setIsLoading(false);
      setError({ notFound: true, message: 'Estabelecimento não encontrado.' });
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchPublicBranding(slug);
      setBranding(result);
    } catch (err) {
      setBranding(null);
      const status = err instanceof NetworkError ? err.statusCode : undefined;
      if (status === 404 || status === 400) {
        setError({ notFound: true, message: 'Estabelecimento não encontrado.' });
      } else {
        setError({
          notFound: false,
          message:
            err instanceof Error
              ? err.message
              : 'Não foi possível carregar o estabelecimento.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    branding,
    realtimeChannel: branding?.realtimeChannel ?? null,
    isLoading,
    error,
    refetch: load,
  };
}
