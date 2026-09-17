import { useEffect, useState } from 'react';

/**
 * Observa uma media query via `window.matchMedia`, re-renderizando quando o
 * resultado muda (ex.: ao redimensionar a janela). É a forma de fazer decisões
 * responsivas no `apps/web`, que estiliza por objetos inline (sem media queries
 * em CSS). Em ambientes sem `matchMedia` (SSR/testes), retorna `false`.
 *
 * @param query media query CSS, ex.: `'(max-width: 768px)'`.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
