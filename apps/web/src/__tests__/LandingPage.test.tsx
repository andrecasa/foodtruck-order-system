import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, it, expect } from 'vitest';
import { routes } from '../App';
import { ThemeProvider } from '../theme';

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
    expect(cta).toHaveAccessibleName('Começar teste gratuito');

    // Conteúdo de marketing renderizado (R1.1).
    expect(
      screen.getByText('Seu food truck online em minutos'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Cardápio digital em minutos'),
    ).toBeInTheDocument();

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
    expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument();
  });
});
