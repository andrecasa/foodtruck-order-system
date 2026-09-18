import type React from 'react';
import { useTheme } from '../theme';
import { Screen } from './Layout';
import { NavBar } from './NavBar';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Imagem de fundo do hero, servida da pasta `public/`. */
const HERO_BACKGROUND_SRC = '/assets/landing/hero/hero.png';

/** Overlay escuro sobre a foto do hero (contraste do texto). */
const HERO_OVERLAY = 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.3))';

/** Largura máxima do texto do hero, como no design (640px). */
const HERO_TEXT_MAX_WIDTH = 640;

/** Ano exibido no rodapé, calculado a partir da data atual. */
const CURRENT_YEAR = new Date().getFullYear();

/**
 * Abaixo desta largura o hero reduz o respiro (alinhado ao breakpoint da navbar).
 */
const MOBILE_QUERY = '(max-width: 768px)';

/** Provas rápidas exibidas abaixo dos CTAs do hero (glifo Material Symbols + rótulo). */
const HERO_PROOFS: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: 'bolt', label: 'Tempo real' },
  { icon: 'qr_code_2', label: 'Pedidos por QR Code' },
  { icon: 'palette', label: 'Com a sua marca' },
];

/** Glifo do Material Symbols Outlined (decorativo). Herda a cor do pai. */
function Glyph({ name, size }: { name: string; size: number }) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{ fontSize: `${size}px`, lineHeight: 0 }}
    >
      {name}
    </span>
  );
}

export interface LandingChromeProps {
  /** Título exibido no hero. */
  heroTitle: string;
  /** Subtítulo/descrição do hero. */
  heroSubtitle: string;
  /** Exibe os CTAs do hero (Começar grátis / Ver como funciona). Padrão: true. */
  showHeroCtas?: boolean;
  /** Ação do CTA primário do hero (ex.: navegar para /signup). */
  onPrimaryCta: () => void;
  /**
   * Ação do Login (navbar/drawer). Quando ausente, usa `onPrimaryCta` como
   * fallback (compatibilidade). Ex.: navegar para /login.
   */
  onLogin?: () => void;
  /** Conteúdo renderizado entre o hero e o rodapé. */
  children: React.ReactNode;
}

/**
 * Casca compartilhada das páginas públicas (Navbar + Hero + Footer), reutilizada
 * pela Landing_Page e pelo Signup_Form. Concentra a navegação do topo, o hero
 * (com imagem de fundo + overlay) e o rodapé, deixando o miolo por conta de cada
 * página via `children`. Estilos 100% derivados do tema (`useTheme()`).
 *
 * Mantém os `data-testid` históricos (`landing-navbar`, `landing-hero`,
 * `landing-cta`, `landing-login`, `landing-footer`) para preservar os testes.
 */
export function LandingChrome({
  heroTitle,
  heroSubtitle,
  showHeroCtas = true,
  onPrimaryCta,
  onLogin,
  children,
}: LandingChromeProps) {
  const handleLogin = onLogin ?? onPrimaryCta;
  const theme = useTheme();
  const isMobile = useMediaQuery(MOBILE_QUERY);

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  // Respiros/tamanhos sem token exato: múltiplos coerentes do maior token.
  const spaceHero = theme.spacing.xl * 2; // 64px
  const heroDisplaySize = theme.typography.sizes.xxl * 1.25; // 40px
  const sidePadding = isMobile ? theme.spacing.md : theme.spacing.xl;
  const heroVerticalPadding = isMobile ? theme.spacing.xl : spaceHero;

  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: '100vh',
  };

  // --- Hero ---
  const heroStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${theme.spacing.lg}px`,
    width: '100%',
    boxSizing: 'border-box',
    padding: `${heroVerticalPadding}px ${sidePadding}px`,
    textAlign: 'center',
    backgroundImage: `${HERO_OVERLAY}, url("${HERO_BACKGROUND_SRC}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  const heroTitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${heroDisplaySize}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.surface,
    margin: 0,
    maxWidth: `${HERO_TEXT_MAX_WIDTH}px`,
    lineHeight: 1.2,
  };

  const heroSubtitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.surface,
    margin: 0,
    maxWidth: `${HERO_TEXT_MAX_WIDTH}px`,
    lineHeight: 1.7,
  };

  const heroCtasStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: `${theme.spacing.sm}px`,
    rowGap: `${isMobile ? theme.spacing.lg : theme.spacing.sm}px`,
  };

  const primaryCtaStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.surface,
    backgroundColor: theme.colors.primary,
    border: `1px solid ${theme.colors.primary}`,
    borderRadius: `${theme.borderRadius.full}px`,
    padding: `${theme.spacing.md}px ${theme.spacing.xl}px`,
    textDecoration: 'none',
    cursor: 'pointer',
  };

  const outlineCtaStyle: React.CSSProperties = {
    ...primaryCtaStyle,
    backgroundColor: 'transparent',
    border: `1px solid ${theme.colors.surface}`,
  };

  const heroProofsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: `${theme.spacing.lg}px`,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  };

  const heroProofStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${theme.spacing.xs}px`,
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.surface,
  };

  // --- Footer ---
  const footerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    boxSizing: 'border-box',
    padding: `${theme.spacing.lg}px ${sidePadding}px`,
    backgroundColor: theme.colors.text,
  };

  const footerBrandStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.surface,
    margin: 0,
  };

  const footerCopyStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.surface,
    opacity: 0.7,
    margin: 0,
  };

  return (
    <Screen padding={false}>
      <div style={pageStyle} data-testid="landing-page">
        <NavBar onPrimaryCta={onPrimaryCta} onLogin={handleLogin} sidePadding={sidePadding} />

        <main style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <section style={heroStyle} data-testid="landing-hero" aria-labelledby="landing-hero-title">
            <h1 id="landing-hero-title" style={heroTitleStyle}>
              {heroTitle}
            </h1>
            <p style={heroSubtitleStyle}>{heroSubtitle}</p>
            {showHeroCtas ? (
              <div style={heroCtasStyle}>
                <button
                  type="button"
                  style={primaryCtaStyle}
                  data-testid="landing-cta"
                  onClick={onPrimaryCta}
                >
                  Começar grátis
                </button>
                <a href="/#central-pedidos" style={outlineCtaStyle} data-testid="landing-secondary-cta">
                  Ver como funciona
                </a>
              </div>
            ) : null}
            <ul style={heroProofsStyle} aria-label="Diferenciais do produto">
              {HERO_PROOFS.map((proof) => (
                <li key={proof.label} style={heroProofStyle}>
                  <Glyph name={proof.icon} size={theme.typography.sizes.xl} />
                  {proof.label}
                </li>
              ))}
            </ul>
          </section>

          {children}
        </main>

        <footer style={footerStyle} data-testid="landing-footer">
          <span style={footerBrandStyle}>{theme.businessName}</span>
          <span style={footerCopyStyle}>
            © {CURRENT_YEAR} · Todos os direitos reservados
          </span>
        </footer>
      </div>
    </Screen>
  );
}
