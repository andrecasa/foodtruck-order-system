import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { useTheme } from '../theme';

/** Imagem exibida em um slide do carrossel. */
export interface ImageCarouselSlide {
  /** URL da imagem (servida da pasta `public/` do Vite). */
  src: string;
  /** Texto alternativo descritivo (acessibilidade). */
  alt: string;
}

export interface ImageCarouselProps {
  /** Imagens a exibir, uma por slide. */
  slides: ReadonlyArray<ImageCarouselSlide>;
  /**
   * Prefixo dos `data-testid` dos elementos internos. Permite ter vários
   * carrosséis na mesma página sem colisão de identificadores.
   */
  testId?: string;
  /** Rótulo acessível do carrossel como um todo. */
  ariaLabel?: string;
  /**
   * Intervalo (ms) para avançar os slides automaticamente. Ausente/0 desliga o
   * autoplay. O autoplay só roda com mais de um slide, pausa no hover/foco e é
   * desativado quando o usuário prefere movimento reduzido
   * (`prefers-reduced-motion`).
   */
  autoplayIntervalMs?: number;
  /**
   * Proporção do slide (CSS `aspect-ratio`, ex.: `'441 / 550'`). Combinada com a
   * largura do container, define a altura do carrossel. Padrão: `441 / 550`.
   */
  aspectRatio?: string;
  /**
   * Altura fixa do slide (px). Quando definida, sobrepõe `aspectRatio` (a altura
   * deixa de depender da largura). Útil para padronizar a altura do carrossel.
   */
  height?: number;
}

/** Espessura do traço do chevron (SVG). Menor = mais fino/clean. */
const CHEVRON_STROKE_WIDTH = 1.5;

/** Proporção padrão do slide, fiel ao mockup do design (441x550, retrato). */
const DEFAULT_SLIDE_ASPECT_RATIO = '441 / 550';

/**
 * Chevron de navegação em SVG. Traço fino e nítido, sem preenchimento; espelhado
 * no eixo X para a direita. Decorativo: o rótulo acessível fica no `<button>`.
 */
function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
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
 * Carrossel de imagens reutilizável, estilizado 100% pelo tema (`useTheme()`),
 * sem cores/tamanhos hardcoded. Diferente do `FeatureCarousel` (que sobrepõe
 * título/descrição sobre a imagem), este apenas exibe imagens (ex.: mockups do
 * app na Landing_Page), preservando o conteúdo sem overlay.
 *
 * Usa o Embla (headless, sem dependências) para o gesto/movimento fluido e a
 * navegação, mantendo marcação, estilo e acessibilidade sob nosso controle:
 * setas anterior/próxima e "dots" com estado acessível (`aria-label`,
 * `aria-current`) e `data-testid` em cada controle.
 *
 * Com um único slide, exibe só a imagem (sem setas/dots), já que não há para
 * onde navegar.
 */
export function ImageCarousel({
  slides,
  testId = 'image-carousel',
  ariaLabel = 'Galeria de imagens',
  autoplayIntervalMs,
  aspectRatio = DEFAULT_SLIDE_ASPECT_RATIO,
  height,
}: ImageCarouselProps) {
  const theme = useTheme();
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'center' });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const hasMultiple = slides.length > 1;

  // Autoplay via setInterval sobre o Embla (sem dependência extra). O ref guarda
  // o timer atual e `canAutoplayRef` sinaliza se o autoplay está habilitado
  // (mais de um slide, intervalo definido e sem `prefers-reduced-motion`).
  const autoplayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canAutoplayRef = useRef(false);

  const stopAutoplay = useCallback(() => {
    if (autoplayRef.current !== null) {
      clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  const startAutoplay = useCallback(() => {
    if (!emblaApi || !canAutoplayRef.current || !autoplayIntervalMs) return;
    stopAutoplay();
    autoplayRef.current = setInterval(() => emblaApi.scrollNext(), autoplayIntervalMs);
  }, [emblaApi, autoplayIntervalMs, stopAutoplay]);

  // Ações manuais reiniciam o timer para não pular logo após a interação.
  const scrollTo = useCallback(
    (index: number) => {
      emblaApi?.scrollTo(index);
      startAutoplay();
    },
    [emblaApi, startAutoplay],
  );
  const scrollPrev = useCallback(() => {
    emblaApi?.scrollPrev();
    startAutoplay();
  }, [emblaApi, startAutoplay]);
  const scrollNext = useCallback(() => {
    emblaApi?.scrollNext();
    startAutoplay();
  }, [emblaApi, startAutoplay]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;

    canAutoplayRef.current = Boolean(
      emblaApi && hasMultiple && autoplayIntervalMs && !prefersReducedMotion,
    );

    if (canAutoplayRef.current) startAutoplay();
    return stopAutoplay;
  }, [emblaApi, hasMultiple, autoplayIntervalMs, startAutoplay, stopAutoplay]);

  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
  };

  // Fundo transparente: o carrossel se adapta a qualquer background da seção
  // (as áreas de "letterbox" do `object-fit: contain` mostram o fundo por trás).
  const viewportStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: `${theme.borderRadius.md}px`,
    backgroundColor: 'transparent',
  };

  const containerStyle: React.CSSProperties = {
    display: 'flex',
  };

  const slideStyle: React.CSSProperties = {
    flex: '0 0 100%',
    minWidth: 0,
    // Altura fixa (se informada) tem precedência sobre a proporção.
    ...(height !== undefined ? { height: `${height}px` } : { aspectRatio }),
  };

  const imageStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  };

  // Setas sobrepostas dentro do viewport, ancoradas nas bordas e centralizadas.
  const arrowStyle = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    [side]: `${theme.spacing.md}px`,
    zIndex: 1,
    backgroundColor: 'transparent',
    // Mesmo azul do tema (e dos dots ativos), visível sobre qualquer fundo.
    color: theme.colors.primary,
    border: 'none',
    padding: 0,
    lineHeight: 0,
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

  // Slide único: sem controles de navegação (não há para onde ir).
  if (!hasMultiple) {
    const only = slides[0];
    if (!only) return null;
    return (
      <div style={wrapperStyle} data-testid={testId}>
        <div style={viewportStyle}>
          <div style={slideStyle}>
            <img
              src={only.src}
              alt={only.alt}
              style={imageStyle}
              data-testid={`${testId}-slide-0`}
              loading="lazy"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle} data-testid={testId}>
      <div
        style={viewportStyle}
        ref={emblaRef}
        role="group"
        aria-label={ariaLabel}
        onMouseEnter={stopAutoplay}
        onMouseLeave={startAutoplay}
        onFocus={stopAutoplay}
        onBlur={startAutoplay}
      >
        <div style={containerStyle}>
          {slides.map((slide, index) => (
            <div key={slide.src} style={slideStyle} data-testid={`${testId}-slide-${index}`}>
              <img src={slide.src} alt={slide.alt} style={imageStyle} loading="lazy" />
            </div>
          ))}
        </div>

        <button
          type="button"
          style={arrowStyle('left')}
          onClick={scrollPrev}
          data-testid={`${testId}-prev`}
          aria-label="Imagem anterior"
        >
          <ChevronIcon direction="left" />
        </button>

        <button
          type="button"
          style={arrowStyle('right')}
          onClick={scrollNext}
          data-testid={`${testId}-next`}
          aria-label="Próxima imagem"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div style={dotsStyle} role="tablist" aria-label={ariaLabel}>
        {slides.map((slide, index) => {
          const active = index === selectedIndex;
          return (
            <button
              key={slide.src}
              type="button"
              style={dotStyle(active)}
              onClick={() => scrollTo(index)}
              data-testid={`${testId}-dot-${index}`}
              aria-label={`Ir para a imagem ${index + 1}`}
              aria-current={active}
            />
          );
        })}
      </div>
    </div>
  );
}
