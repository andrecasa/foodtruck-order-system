import { useCallback, useEffect, useState } from 'react';
import type { PublicMenuCategory } from '@order-system/shared';
import { fetchPublicMenu } from '../../services/public-client';
import { NetworkError } from '../../services/real-client';

export interface UsePublicMenuResult {
  /** Menu categories (with active items), pre-ordered by the backend. */
  categories: PublicMenuCategory[];
  isLoading: boolean;
  /** Error state. `notFound` is true when the slug resolved to a 404. */
  error: { notFound: boolean; message: string } | null;
  /** Refetches the menu (e.g. from a retry button). */
  refetch: () => void;
}

/**
 * Fetches the public menu for a tenant slug (no authentication).
 *
 * Consumed by CustomerMenuScreen to render categories and items. The backend
 * already filters inactive items/categories and returns categories ordered by
 * `sortOrder`, so the hook simply preserves that order.
 */
export function usePublicMenu(slug: string | undefined): UsePublicMenuResult {
  const [categories, setCategories] = useState<PublicMenuCategory[]>([]);
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
      const result = await fetchPublicMenu(slug);
      setCategories(result);
    } catch (err) {
      setCategories([]);
      const status = err instanceof NetworkError ? err.statusCode : undefined;
      if (status === 404 || status === 400) {
        setError({ notFound: true, message: 'Estabelecimento não encontrado.' });
      } else {
        setError({
          notFound: false,
          message:
            err instanceof Error ? err.message : 'Não foi possível carregar o cardápio.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  return { categories, isLoading, error, refetch: load };
}
