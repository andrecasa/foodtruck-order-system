import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from '../theme';
import { FeatureCarousel, FeatureModal, ImageCarousel, NavDrawer } from '../components';
import type { FeatureSlide, ImageCarouselSlide, NavDrawerLink } from '../components';

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

const IMAGE_SLIDES: ReadonlyArray<ImageCarouselSlide> = [
  { src: '/assets/a.png', alt: 'Tela A' },
  { src: '/assets/b.png', alt: 'Tela B' },
];

describe('ImageCarousel (Embla)', () => {
  it('renderiza uma imagem e um dot por slide, com o primeiro marcado', () => {
    renderWithTheme(<ImageCarousel slides={IMAGE_SLIDES} testId="mockups" />);

    expect(screen.getByTestId('mockups')).toBeInTheDocument();
    expect(screen.getByAltText('Tela A')).toBeInTheDocument();
    expect(screen.getByAltText('Tela B')).toBeInTheDocument();
    expect(screen.getByTestId('mockups-dot-0')).toHaveAttribute('aria-current', 'true');
  });

  it('expõe controles de anterior/próximo acessíveis quando há vários slides', () => {
    renderWithTheme(<ImageCarousel slides={IMAGE_SLIDES} testId="mockups" />);

    expect(screen.getByTestId('mockups-prev')).toHaveAccessibleName('Imagem anterior');
    expect(screen.getByTestId('mockups-next')).toHaveAccessibleName('Próxima imagem');
  });

  it('com um único slide, não exibe setas nem dots (nada para navegar)', () => {
    renderWithTheme(
      <ImageCarousel slides={[{ src: '/assets/a.png', alt: 'Tela única' }]} testId="single" />,
    );

    expect(screen.getByAltText('Tela única')).toBeInTheDocument();
    expect(screen.queryByTestId('single-prev')).not.toBeInTheDocument();
    expect(screen.queryByTestId('single-next')).not.toBeInTheDocument();
    expect(screen.queryByTestId('single-dot-0')).not.toBeInTheDocument();
  });

  it('com autoplay ativo, avança sozinho sem quebrar e mantém os controles', () => {
    vi.useFakeTimers();
    try {
      renderWithTheme(
        <ImageCarousel slides={IMAGE_SLIDES} testId="auto" autoplayIntervalMs={10_000} />,
      );

      // Vários ciclos do timer de 10s não devem lançar nem desmontar o carrossel.
      act(() => {
        vi.advanceTimersByTime(30_000);
      });

      expect(screen.getByTestId('auto')).toBeInTheDocument();
      expect(screen.getByTestId('auto-next')).toBeInTheDocument();
      expect(screen.getAllByRole('img')).toHaveLength(IMAGE_SLIDES.length);
    } finally {
      vi.useRealTimers();
    }
  });
});

const DRAWER_LINKS: ReadonlyArray<NavDrawerLink> = [
  { label: 'Operador', href: '#central-pedidos' },
  { label: 'Cliente', href: '#geolocalizacao' },
];

describe('NavDrawer (Radix Dialog / hambúrguer)', () => {
  it('abre pelo hambúrguer e mostra links e login', async () => {
    const user = userEvent.setup();
    renderWithTheme(<NavDrawer links={DRAWER_LINKS} onLogin={() => {}} />);

    // Fechado por padrão: só o gatilho hambúrguer está presente.
    expect(screen.getByTestId('landing-nav-toggle')).toHaveAccessibleName('Abrir menu');
    expect(screen.queryByTestId('landing-nav-drawer')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('landing-nav-toggle'));

    const drawer = await screen.findByTestId('landing-nav-drawer');
    expect(drawer).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('landing-drawer-nav-central-pedidos')).toBeInTheDocument();
    expect(screen.getByTestId('landing-drawer-nav-geolocalizacao')).toBeInTheDocument();
    expect(screen.getByTestId('landing-drawer-login')).toHaveAccessibleName(
      'Entrar na sua conta',
    );
  });

  it('aciona onLogin e fecha a gaveta ao tocar em Login', async () => {
    const user = userEvent.setup();
    const onLogin = vi.fn();
    renderWithTheme(<NavDrawer links={DRAWER_LINKS} onLogin={onLogin} />);

    await user.click(screen.getByTestId('landing-nav-toggle'));
    await user.click(await screen.findByTestId('landing-drawer-login'));

    expect(onLogin).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('landing-nav-drawer')).not.toBeInTheDocument();
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
