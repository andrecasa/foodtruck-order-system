import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { routes } from '../../App';
import { ThemeProvider } from '../../theme';

/**
 * Feature: landing-onboarding, Property 15: Rota não pública direciona para a
 * Landing_Page.
 *
 * Para qualquer caminho de URL que não corresponda a uma rota pública conhecida
 * (`/` ou `/signup`), o Web_Router deve renderizar a Landing_Page — nunca o
 * Signup_Form. Isso valida o catch-all (`*` → redireciona para `/`), garantindo
 * que qualquer rota não pública (incluindo as antigas telas autenticadas) caia
 * na landing.
 *
 * O teste monta um roteador equivalente ao de produção via `createMemoryRouter`
 * (que possui histórico próprio, ideal para testes) reusando a mesma `routes`
 * exportada por `App.tsx` — fonte única da verdade, sem duplicar a config.
 *
 * **Validates: Requirements 2.3**
 */

/** Rotas públicas conhecidas que NÃO devem cair no catch-all. */
const PUBLIC_PATHS = new Set(['/', '/signup']);

/**
 * Renderiza o Web_Router no caminho informado e devolve o resultado do render,
 * envolvido pelo `ThemeProvider` (as páginas dependem de `useTheme`).
 */
function renderRouterAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

/**
 * Caracteres realistas de um segmento de caminho de rota (letras, dígitos e os
 * caracteres "unreserved" de URL: `-`, `.`, `_`, `~`). Deliberadamente NÃO
 * incluímos caracteres de controle/percent-encoded (ex.: `%0A`) nem `/`, pois
 * não representam navegação real de rota do app e apenas exercitam o parser de
 * URL do react-router (fora do escopo da propriedade R2.3).
 */
const PATH_SEGMENT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';

/**
 * Gera caminhos de URL absolutos e bem-formados dentro do app: uma barra inicial
 * seguida de 1..4 segmentos compostos por caracteres realistas de rota,
 * excluindo as rotas públicas conhecidas (`/` e `/signup`).
 */
function nonPublicPathArb(): fc.Arbitrary<string> {
  const segmentArb = fc
    .array(fc.constantFrom(...PATH_SEGMENT_CHARS.split('')), { minLength: 1, maxLength: 12 })
    .map((chars) => chars.join(''));
  return fc
    .array(segmentArb, { minLength: 1, maxLength: 4 })
    .map((segments) => `/${segments.join('/')}`)
    .filter((p) => !PUBLIC_PATHS.has(p));
}

describe('Property 15: Rota não pública direciona para a Landing_Page', () => {
  it('caminhos arbitrários não públicos renderizam a Landing_Page (nunca o Signup_Form)', () => {
    fc.assert(
      fc.property(nonPublicPathArb(), (path) => {
        const { unmount } = renderRouterAt(path);
        try {
          expect(screen.getByTestId('landing-page')).toBeInTheDocument();
          expect(screen.queryByTestId('signup-page')).not.toBeInTheDocument();
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('exemplos concretos de rotas antigas autenticadas caem na Landing_Page', () => {
    for (const path of ['/login', '/queue', '/foo/bar', '/signup/extra', '/qualquer']) {
      const { unmount } = renderRouterAt(path);
      expect(screen.getByTestId('landing-page')).toBeInTheDocument();
      expect(screen.queryByTestId('signup-page')).not.toBeInTheDocument();
      unmount();
    }
  });

  it('rotas públicas conhecidas continuam renderizando suas próprias páginas', () => {
    const landing = renderRouterAt('/');
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();
    landing.unmount();

    const signup = renderRouterAt('/signup');
    expect(screen.getByTestId('signup-page')).toBeInTheDocument();
    signup.unmount();
  });
});
