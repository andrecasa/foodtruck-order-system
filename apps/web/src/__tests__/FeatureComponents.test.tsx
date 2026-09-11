import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { ThemeProvider } from '../theme';
import { FeatureCarousel, FeatureModal } from '../components';
import type { FeatureSlide } from '../components';

/**
 * Testes do POC de UI headless na Landing_Page: carrossel (Embla) e modal
 * (Radix Dialog), ambos estilizados via `useTheme()`.
 *
 * Cobrem o contrato observável para o usuário: os slides são renderizados, a
 * navegação por "dots" marca o item atual (`aria-current`), e o modal abre pelo
 * gatilho e fecha pelo botão de fechar — exercitando a acessibilidade que o
 * Radix fornece (foco/`role="dialog"`) sem depender de detalhes internos.
 */

const SLIDES: ReadonlyArray<FeatureSlide> = [
  { title: 'Cardápio digital', description: 'Publique em minutos.' },
  { title: 'Pedidos no WhatsApp', description: 'Fila organizada.' },
];

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('FeatureCarousel (Embla)', () => {
  it('renderiza todos os slides e um dot por slide', () => {
    renderWithTheme(<FeatureCarousel slides={SLIDES} />);

    expect(screen.getByTestId('landing-feature-carousel')).toBeInTheDocument();
    expect(screen.getAllByTestId('landing-feature-slide')).toHaveLength(SLIDES.length);
    expect(screen.getByText('Cardápio digital')).toBeInTheDocument();
    expect(screen.getByText('Pedidos no WhatsApp')).toBeInTheDocument();

    // O primeiro dot começa marcado como atual (aria-current).
    expect(screen.getByTestId('landing-feature-carousel-dot-0')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('expõe controles de anterior/próximo acessíveis', () => {
    renderWithTheme(<FeatureCarousel slides={SLIDES} />);

    expect(screen.getByTestId('landing-feature-carousel-prev')).toHaveAccessibleName(
      'Funcionalidade anterior',
    );
    expect(screen.getByTestId('landing-feature-carousel-next')).toHaveAccessibleName(
      'Próxima funcionalidade',
    );
  });
});

describe('FeatureModal (Radix Dialog)', () => {
  it('abre pelo gatilho e fecha pelo botão de fechar', async () => {
    const user = userEvent.setup();
    renderWithTheme(<FeatureModal />);

    // Fechado por padrão.
    expect(screen.queryByTestId('landing-feature-modal')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('landing-feature-modal-trigger'));

    const dialog = await screen.findByTestId('landing-feature-modal');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByTestId('landing-feature-modal-close'));

    expect(screen.queryByTestId('landing-feature-modal')).not.toBeInTheDocument();
  });
});
