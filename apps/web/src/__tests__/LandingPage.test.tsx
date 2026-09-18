import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, it, expect } from 'vitest';
import { routes } from '../App';
import { ThemeProvider } from '../theme';

// `matchMedia` nativo do ambiente de teste (happy-dom). É usado pelo Embla e
// pelo restante da app; por isso o mock apenas sobrescreve a resposta da query
// de mobile e delega as demais ao original, restaurado no `afterEach`.
const realMatchMedia = window.matchMedia;

/**
 * Faz a query de mobile (`max-width`) responder `matches = isMobile`, mantendo
 * as demais queries (ex.: `prefers-reduced-motion`) com o comportamento real.
 */
function mockMatchMedia(isMobile: boolean) {
  window.matchMedia = ((query: string) => {
    if (query.includes('max-width')) {
      return {
        matches: isMobile,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList;
    }
    return realMatchMedia.call(window, query);
  }) as typeof window.matchMedia;
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

/**
 * Testes da Landing_Page pública (feature landing-onboarding, R1).
 *
 * Cobrem:
 * - R1.1/R1.3: a landing renderiza o CTA e o conteúdo de divulgação sem exigir
 *   autenticação — não há `AuthProvider`, apenas o `ThemeProvider` (as páginas
 *   dependem de `useTheme`).
 * - R1.2: acionar o CTA navega para o Signup_Form em `/signup`.
 *
 * A navegação é verificada montando um roteador equivalente ao de produção via
 * `createMemoryRouter` (histórico próprio, ideal para testes) reusando a mesma
 * `routes` exportada por `App.tsx` — fonte única da verdade, sem duplicar a
 * config. Após clicar no CTA, o Signup_Form (`data-testid="signup-page"`) passa
 * a ser renderizado, comprovando que a navegação ocorreu.
 */

/**
 * Renderiza o Web_Router no caminho informado, envolvido pelo `ThemeProvider`.
 */
function renderRouterAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
}

describe('LandingPage', () => {
  it('renderiza o CTA e o conteúdo de divulgação sem exigir autenticação (R1.1/R1.3)', () => {
    renderRouterAt('/');

    // Página de divulgação presente (não depende de nenhum provider de auth).
    expect(screen.getByTestId('landing-page')).toBeInTheDocument();

    // CTA de teste gratuito presente e acessível (R1.1).
    const cta = screen.getByTestId('landing-cta');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAccessibleName('Começar grátis');

    // Conteúdo de marketing renderizado (R1.1): hero e seções do design.
    expect(
      screen.getByText('Seu negócio de um jeito fácil'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('landing-section-central-pedidos')).toBeInTheDocument();
    expect(screen.getByTestId('landing-section-resumo-financeiro')).toBeInTheDocument();
    expect(screen.getByTestId('landing-section-geolocalizacao')).toBeInTheDocument();

    // Continua na landing — não navegou sem interação.
    expect(screen.queryByTestId('signup-page')).not.toBeInTheDocument();
  });

  it('navega para /signup ao acionar o CTA (R1.2)', async () => {
    const user = userEvent.setup();
    renderRouterAt('/');

    expect(screen.getByTestId('landing-page')).toBeInTheDocument();

    await user.click(screen.getByTestId('landing-cta'));

    // A navegação ocorreu: o Signup_Form passou a ser renderizado.
    expect(screen.getByTestId('signup-page')).toBeInTheDocument();
  });

  it('no mobile, troca os links inline pelo hambúrguer (drawer)', () => {
    mockMatchMedia(true);
    renderRouterAt('/');

    // Hambúrguer presente; login inline e links inline da navbar ausentes.
    expect(screen.getByTestId('landing-nav-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-login')).not.toBeInTheDocument();
    expect(screen.queryByTestId('landing-nav-central-pedidos')).not.toBeInTheDocument();
  });

  it('no desktop, mostra os links inline e o login (sem hambúrguer)', () => {
    mockMatchMedia(false);
    renderRouterAt('/');

    expect(screen.getByTestId('landing-login')).toBeInTheDocument();
    expect(screen.getByTestId('landing-nav-central-pedidos')).toBeInTheDocument();
    expect(screen.queryByTestId('landing-nav-toggle')).not.toBeInTheDocument();
  });
});
