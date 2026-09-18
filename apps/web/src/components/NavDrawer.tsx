import type React from 'react';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTheme } from '../theme';

/** Link de navegação exibido no drawer. */
export interface NavDrawerLink {
  label: string;
  href: string;
}

export interface NavDrawerProps {
  /** Links de navegação (âncoras para seções da página). */
  links: ReadonlyArray<NavDrawerLink>;
  /** Ação disparada ao acionar o item de login dentro do drawer. */
  onLogin: () => void;
  /** Rótulo do item de login. */
  loginLabel?: string;
  /** Ação do CTA primário ("Começar grátis"). Quando ausente, o CTA não aparece. */
  onPrimaryCta?: () => void;
  /** Rótulo do CTA primário. */
  primaryCtaLabel?: string;
}

/**
 * Glifo do Material Symbols Outlined (fonte de ícones do `apps/web`, já
 * carregada no `index.html`). Decorativo (`aria-hidden`); herda a cor do pai.
 */
function MaterialIcon({
  name,
  size,
  weight,
}: {
  name: string;
  size: number;
  /** Peso do traço (eixo `wght` do Material Symbols, 100–700). Menor = mais fino. */
  weight?: number;
}) {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{
        fontSize: `${size}px`,
        lineHeight: 0,
        ...(weight !== undefined
          ? { fontVariationSettings: `'wght' ${weight}, 'opsz' 24, 'FILL' 0, 'GRAD' 0` }
          : null),
      }}
    >
      {name}
    </span>
  );
}

/**
 * Menu de navegação mobile: botão "hambúrguer" que abre uma gaveta (drawer)
 * lateral com os links e o login. É construído sobre o Radix Dialog — mesmo
 * primitivo do `FeatureModal` —, então herda a acessibilidade pronta (foco preso,
 * fechar por Esc/backdrop, `role="dialog"` + `aria-modal`), com o visual 100%
 * derivado dos tokens de tema (`useTheme()`). Selecionar qualquer item fecha a
 * gaveta (via `Dialog.Close`).
 *
 * A decisão de exibir este componente (mobile) ou a navbar inline (desktop) é do
 * chamador, tipicamente via `useMediaQuery`.
 */
export function NavDrawer({
  links,
  onLogin,
  loginLabel = 'Login',
  onPrimaryCta,
  primaryCtaLabel = 'Começar grátis',
}: NavDrawerProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  // Ícones de controle (hambúrguer/fechar) num visual mais clean: traço fino
  // (`wght` 300) e um tamanho um pouco menor que o xxl.
  const controlIconWeight = 300;
  const controlIconSize = theme.typography.sizes.xl * 1.2; // 24px

  const iconButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: theme.colors.text,
    border: 'none',
    padding: `${theme.spacing.xs}px`,
    cursor: 'pointer',
    lineHeight: 0,
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 10,
  };

  const contentStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    height: '100%',
    width: 'min(320px, 85vw)',
    boxSizing: 'border-box',
    backgroundColor: theme.colors.surface,
    borderLeft: `1px solid ${theme.colors.border}`,
    boxShadow: '-12px 0 32px rgba(0, 0, 0, 0.18)',
    // Gutter horizontal igual ao da navbar mobile (`md`), para o "X" cair na
    // mesma posição do hambúrguer. O vertical (`lg`) mantém o "X" na altura do
    // hambúrguer (centralizado na navbar).
    padding: `${theme.spacing.lg}px ${theme.spacing.md}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.lg}px`,
    zIndex: 11,
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${theme.spacing.md}px`,
  };

  const titleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const linksListStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  };

  const linkStyle: React.CSSProperties = {
    display: 'block',
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
    textDecoration: 'none',
    padding: `${theme.spacing.sm}px 0`,
  };

  // "Começar grátis" como item de link da lista (mesmo visual dos demais links),
  // sem aparência de botão. É um <button> por ser uma ação (navegação).
  const linkButtonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
    backgroundColor: 'transparent',
    border: 'none',
    padding: `${theme.spacing.sm}px 0`,
    cursor: 'pointer',
    textAlign: 'left',
  };

  // Login como item de link (mesmo visual dos demais), sem aparência de botão.
  // Continua sendo um `<button>` por ser uma ação (navegação), mas estilizado
  // como link e alinhado à esquerda como os outros itens.
  const loginLinkStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: `${theme.spacing.xs}px`,
    // Empurra o Login para o rodapé da gaveta.
    marginTop: 'auto',
    fontFamily,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.text,
    backgroundColor: 'transparent',
    border: 'none',
    padding: `${theme.spacing.sm}px 0`,
    cursor: 'pointer',
    textAlign: 'left',
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          style={iconButtonStyle}
          data-testid="landing-nav-toggle"
          aria-label="Abrir menu"
        >
          <MaterialIcon name="menu" size={controlIconSize} weight={controlIconWeight} />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle} />
        <Dialog.Content
          style={contentStyle}
          data-testid="landing-nav-drawer"
          aria-describedby={undefined}
        >
          <div style={headerStyle}>
            <Dialog.Title style={titleStyle}>Menu</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                style={iconButtonStyle}
                data-testid="landing-nav-drawer-close"
                aria-label="Fechar menu"
              >
                <MaterialIcon name="close" size={controlIconSize} weight={controlIconWeight} />
              </button>
            </Dialog.Close>
          </div>

          <nav aria-label="Navegação principal">
            <ul style={linksListStyle}>
              {/* "Começar grátis" é o primeiro item, como link (não botão). */}
              {onPrimaryCta ? (
                <li>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      style={linkButtonStyle}
                      data-testid="landing-drawer-cta"
                      onClick={onPrimaryCta}
                    >
                      {primaryCtaLabel}
                    </button>
                  </Dialog.Close>
                </li>
              ) : null}
              {links.map((link) => (
                <li key={link.href}>
                  <Dialog.Close asChild>
                    <a
                      href={link.href}
                      style={linkStyle}
                      data-testid={`landing-drawer-nav-${link.href.replace(/^\/?#/, '')}`}
                    >
                      {link.label}
                    </a>
                  </Dialog.Close>
                </li>
              ))}
            </ul>
          </nav>

          <Dialog.Close asChild>
            <button
              type="button"
              style={loginLinkStyle}
              data-testid="landing-drawer-login"
              aria-label="Entrar na sua conta"
              onClick={onLogin}
            >
              <MaterialIcon name="login" size={theme.typography.sizes.lg} />
              {loginLabel}
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
