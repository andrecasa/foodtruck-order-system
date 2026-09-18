import type React from 'react';
import { useTheme } from '../theme';
import { NavDrawer } from './NavDrawer';
import type { NavDrawerLink } from './NavDrawer';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Logomarca da marca, servida da pasta `public/` do Vite (URL raiz). */
const LOGO_SRC = '/assets/logo.png';

/** Abaixo desta largura a navbar troca os links inline por hambúrguer + drawer. */
const NAVBAR_MOBILE_QUERY = '(max-width: 768px)';

/** Links de navegação do topo (âncoras para as seções da landing). */
export const NAV_LINKS: ReadonlyArray<NavDrawerLink> = [
  { label: 'Central de Pedidos', href: '/#central-pedidos' },
  { label: 'Resumo Financeiro', href: '/#resumo-financeiro' },
  { label: 'Geolocalização', href: '/#geolocalizacao' },
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

export interface NavBarProps {
  /** Ação do CTA "Começar grátis" (ex.: navegar para /signup). */
  onPrimaryCta: () => void;
  /** Ação do Login (ex.: navegar para /login). */
  onLogin: () => void;
  /** Padding horizontal da barra (px). Alinha com o gutter da página. */
  sidePadding: number;
}

/**
 * Barra de navegação superior reutilizável das páginas públicas.
 *
 * No desktop exibe a marca + links de seção inline, o CTA "Começar grátis" e o
 * Login. Abaixo do breakpoint mobile, colapsa em um botão hambúrguer que abre o
 * `NavDrawer` (com os mesmos links, CTA e Login). Estilos derivam do tema
 * (`useTheme()`); `NAV_LINKS` é a fonte única dos itens de navegação.
 *
 * Mantém os `data-testid` históricos (`landing-navbar`, `landing-login`,
 * `landing-cta` no drawer via `landing-drawer-cta`) para preservar os testes.
 */
export function NavBar({ onPrimaryCta, onLogin, sidePadding }: NavBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(NAVBAR_MOBILE_QUERY);
  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const navbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    boxSizing: 'border-box',
    padding: `${theme.spacing.md}px ${sidePadding}px`,
    backgroundColor: theme.colors.surface,
    borderBottom: `1px solid ${theme.colors.border}`,
  };

  const navLeftStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: `${theme.spacing.xl}px`,
  };

  const brandStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: `${theme.spacing.sm}px`,
  };

  const navLogoStyle: React.CSSProperties = {
    height: '45px',
    width: 'auto',
    objectFit: 'contain',
  };

  const brandNameStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const navLinksStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: `${theme.spacing.xl}px`,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  };

  const navLinkStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
    textDecoration: 'none',
  };

  const navRightStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: `${theme.spacing.md}px`,
  };

  const loginButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `${theme.spacing.xs}px`,
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  };

  // "Começar grátis" como item de link (mesmo visual dos demais), sem aparência
  // de botão. É um <button> por ser uma ação, estilizado como link.
  const navLinkButtonStyle: React.CSSProperties = {
    ...navLinkStyle,
    backgroundColor: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
  };

  return (
    <header style={navbarStyle} data-testid="landing-navbar">
      <div style={navLeftStyle}>
        <div style={brandStyle}>
          <img src={LOGO_SRC} alt={theme.businessName} style={navLogoStyle} />
          <span style={brandNameStyle}>{theme.businessName}</span>
        </div>
        {!isMobile && (
          <nav aria-label="Navegação principal">
            <ul style={navLinksStyle}>
              {/* "Começar grátis" é o primeiro item, como link (não botão). É uma
                  ação (navega para o cadastro), por isso um <button> estilizado
                  como link para manter a semântica. */}
              <li>
                <button
                  type="button"
                  style={navLinkButtonStyle}
                  data-testid="landing-nav-cta"
                  onClick={onPrimaryCta}
                >
                  Começar grátis
                </button>
              </li>
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    style={navLinkStyle}
                    data-testid={`landing-nav-${link.href.replace(/^\/?#/, '')}`}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      {isMobile ? (
        <NavDrawer links={NAV_LINKS} onLogin={onLogin} onPrimaryCta={onPrimaryCta} />
      ) : (
        <div style={navRightStyle}>
          <button
            type="button"
            style={loginButtonStyle}
            data-testid="landing-login"
            aria-label="Entrar na sua conta"
            onClick={onLogin}
          >
            <Glyph name="login" size={theme.typography.sizes.xl} />
            Login
          </button>
        </div>
      )}
    </header>
  );
}
