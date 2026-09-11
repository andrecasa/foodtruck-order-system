import type React from 'react';
import { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useTheme } from '../theme';

/** Item de funcionalidade exibido em cada slide do carrossel. */
export interface FeatureSlide {
  title: string;
  description: string;
  /**
   * URL opcional de imagem de fundo do slide. Quando presente, o slide usa a
   * imagem cobrindo o fundo com um overlay escuro para manter o texto legível
   * (contraste). Ausente, o slide mantém o fundo por tokens de tema.
   */
  backgroundImage?: string;
}

export interface FeatureCarouselProps {
  /** Slides de funcionalidades a exibir (um por vez). */
  slides: ReadonlyArray<FeatureSlide>;
}

/** Espessura do traço do chevron (SVG). Menor = mais fino/clean. */
const CHEVRON_STROKE_WIDTH = 1.5;

/** Altura mínima de cada slide (define a altura do carrossel). */
const SLIDE_MIN_HEIGHT = '360px';

/**
 * Chevron de navegação em SVG. Traço fino e nítido (via `strokeWidth`), sem
 * preenchimento, escalável em qualquer tamanho sem depender do glifo da fonte.
 * Decorativo: o rótulo acessível fica no `<button>` que o envolve.
 */
function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  // Caminho de um "V" apontando para a esquerda; espelhado no eixo X quando for
  // para a direita, reaproveitando o mesmo traçado.
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={CHEVRON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={direction === 'right' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <polyline points="15 5 8 12 15 19" />
    </svg>
  );
}

/**
 * Prova de conceito de carrossel de funcionalidades com Embla, estilizado 100%
 * pelo tema do projeto (`useTheme()`), sem cores/tamanhos hardcoded.
 *
 * O Embla é headless e sem dependências: cuida do gesto/movimento fluido e da
 * navegação entre slides, deixando marcação, estilo e acessibilidade sob nosso
 * controle. Aqui adicionamos botões de anterior/próximo e "dots" com estado
 * acessível (`aria-label`, `aria-current`) e `data-testid` em cada controle,
 * mostrando o baixo atrito de integrar a lib mantendo os padrões do `apps/web`.
 */
export function FeatureCarousel({ slides }: FeatureCarouselProps) {
  const theme = useTheme();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'center' });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: '960px',   
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
  };

  // O viewport recorta a área visível; o container é a "esteira" dos slides.
  // `position: relative` ancora as setas sobrepostas (position: absolute) dentro
  // dos limites do carrossel.
  const viewportStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: `${theme.borderRadius.lg}px`,
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
  };

  // Overlay escuro aplicado por cima da imagem para garantir contraste do texto
  // (WCAG) independentemente da foto usada. Sobre imagem, o texto fica claro.
  const IMAGE_OVERLAY = 'linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.5))';

  const slideStyle = (slide: FeatureSlide): React.CSSProperties => {
    const base: React.CSSProperties = {
      flex: '0 0 100%',
      minWidth: 0,
      boxSizing: 'border-box',
      padding: `${theme.spacing.xl}px ${theme.spacing.lg}px`,
      minHeight: SLIDE_MIN_HEIGHT,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: `${theme.spacing.sm}px`,
      textAlign: 'center',
    };

    if (slide.backgroundImage) {
      return {
        ...base,
        backgroundImage: `${IMAGE_OVERLAY}, url("${slide.backgroundImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      };
    }

    return { ...base, backgroundColor: theme.colors.surfacePrimary };
  };

  const slideTitleStyle = (hasImage: boolean): React.CSSProperties => ({
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: hasImage ? theme.colors.surface : theme.colors.text,
    margin: 0,
  });

  const slideTextStyle = (hasImage: boolean): React.CSSProperties => ({
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: hasImage ? theme.colors.surface : theme.colors.textSecondary,
    margin: 0,
    lineHeight: 1.5,
  });

  // Setas sobrepostas dentro do viewport: ancoradas nas bordas esquerda/direita
  // e centralizadas verticalmente. Visual clean: chevron em SVG (traço fino via
  // `strokeWidth`, sem círculo de fundo), alongado na vertical via `scaleY`
  // (combinado com o `translateY(-50%)` de centralização na mesma transformação).
  const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    transform: `translateY(-50%) scaleY(2.5)`,
    [side]: `${theme.spacing.md}px`,
    zIndex: 1,
    backgroundColor: 'transparent',
    color: theme.colors.surface,
    border: 'none',
    padding: 0,
    lineHeight: 0,
    opacity: 0.5,
    cursor: 'pointer',
  });

  const dotsStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${theme.spacing.xs}px`,
  };

  const dotStyle = (active: boolean): React.CSSProperties => ({
    width: '10px',
    height: '10px',
    padding: 0,
    borderRadius: `${theme.borderRadius.full}px`,
    border: 'none',
    backgroundColor: active ? theme.colors.primary : theme.colors.border,
    cursor: 'pointer',
  });

  return (
    <div style={wrapperStyle} data-testid="landing-feature-carousel">
      <div style={viewportStyle} ref={emblaRef}>
        <div style={containerStyle}>
          {slides.map((slide) => {
            const hasImage = Boolean(slide.backgroundImage);
            return (
              <div key={slide.title} style={slideStyle(slide)} data-testid="landing-feature-slide">
                <h3 style={slideTitleStyle(hasImage)}>{slide.title}</h3>
                <p style={slideTextStyle(hasImage)}>{slide.description}</p>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          style={arrowStyle('left')}
          onClick={scrollPrev}
          data-testid="landing-feature-carousel-prev"
          aria-label="Funcionalidade anterior"
        >
          <ChevronIcon direction="left" />
        </button>

        <button
          type="button"
          style={arrowStyle('right')}
          onClick={scrollNext}
          data-testid="landing-feature-carousel-next"
          aria-label="Próxima funcionalidade"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div style={dotsStyle} role="tablist" aria-label="Selecionar funcionalidade">
        {slides.map((slide, index) => {
          const active = index === selectedIndex;
          return (
            <button
              key={slide.title}
              type="button"
              style={dotStyle(active)}
              onClick={() => scrollTo(index)}
              data-testid={`landing-feature-carousel-dot-${index}`}
              aria-label={`Ir para: ${slide.title}`}
              aria-current={active}
            />
          );
        })}
      </div>
    </div>
  );
}
