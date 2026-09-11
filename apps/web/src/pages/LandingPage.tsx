import type React from 'react';
import { useNavigate } from 'react-router';
import { useTheme } from '../theme';
import { Screen, FeatureCarousel, FeatureModal } from '../components';

/**
 * Landing_Page pública de divulgação do produto (R1).
 *
 * Exibe o conteúdo de marketing do `order-system` e um CTA (call-to-action) que
 * inicia o teste gratuito, navegando para o Signup_Form em `/signup` via
 * `useNavigate` do Web_Router (R1.1/R1.2). É renderizada sem exigir autenticação
 * (R1.3): não depende de nenhum hook de auth nem faz chamadas protegidas.
 *
 * Estilos derivam do tema (`useTheme()`), sem cores/tamanhos hardcoded, e os
 * elementos interativos expõem `data-testid` e atributos de acessibilidade.
 *
 * Além do hero, dos destaques e do CTA principal (`landing-cta`), a página traz
 * seções de marketing complementares (como funciona, CTA final e rodapé) que
 * também levam ao Signup_Form, sem alterar o contrato de navegação.
 */

/**
 * Destaques de divulgação exibidos na landing (R1.1). Cada slide tem sua própria
 * imagem de fundo (`backgroundImage`), servida da pasta `public/` do Vite e
 * portanto referenciada pela URL raiz `/assets/...` (sem import).
 */
const HIGHLIGHTS: ReadonlyArray<{
  title: string;
  description: string;
  backgroundImage?: string;
}> = [
  {
    title: 'Cardápio digital em minutos',
    description:
      'Publique seu cardápio com foto, preço e categorias sem depender de ninguém.',
    backgroundImage: '/assets/carousel-01.png',
  },
  {
    title: 'Pedidos direto no WhatsApp',
    description:
      'Seus clientes montam o pedido e você acompanha tudo em uma fila organizada.',
    backgroundImage: '/assets/carousel-02.png',
  },
  {
    title: 'Identidade visual da sua marca',
    description:
      'Escolha as cores e envie sua logomarca para o app já nascer com a sua cara.',
    backgroundImage: '/assets/carousel-03.png',
  },
];

/**
 * Passos do onboarding self-service exibidos na seção "como funciona" (R1.1).
 * São apenas conteúdo de divulgação; não alteram o contrato de navegação.
 */
const STEPS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: '1. Crie sua conta',
    description:
      'Informe os dados do seu negócio, escolha as cores e envie sua logomarca.',
  },
  {
    title: '2. Monte seu cardápio',
    description:
      'Comece com um cardápio pronto e ajuste categorias, itens e preços na hora.',
  },
  {
    title: '3. Receba pedidos',
    description:
      'Compartilhe o link com seus clientes e acompanhe a fila em tempo real.',
  },
];

/**
 * Logomarca exibida no topo do hero. Servida da pasta `public/` do Vite,
 * portanto referenciada pela URL raiz `/assets/...` (sem import).
 */
const LOGO_SRC = '/assets/logo.png';

/** Ano exibido no rodapé, calculado a partir da data atual. */
const CURRENT_YEAR = new Date().getFullYear();

export function LandingPage() {
  const theme = useTheme();
  const navigate = useNavigate();

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: `${theme.spacing.xl}px ${theme.spacing.lg}px`,
    gap: `${theme.spacing.lg}px`,
    textAlign: 'center',
  };

  const heroStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.md}px`,
    maxWidth: '640px',
  };

  const logoStyle: React.CSSProperties = {
    height: '150px',
    width: 'auto',
    objectFit: 'contain',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.xxl}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const subtitleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
    lineHeight: 1.5,
  };

  const highlightsStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    maxWidth: '960px',
  };

  const cardTitleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const cardTextStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
    lineHeight: 1.5,
  };

  const sectionHeadingStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.xl}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const stepsSectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.lg}px`,
    width: '100%',
    maxWidth: '960px',
  };

  const stepsListStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: `${theme.spacing.md}px`,
    width: '100%',
    listStyle: 'none',
    margin: 0,
    padding: 0,
  };

  const stepCardStyle: React.CSSProperties = {
    flex: '1 1 240px',
    maxWidth: '300px',
    backgroundColor: theme.colors.surfacePrimary,
    borderRadius: `${theme.borderRadius.md}px`,
    padding: `${theme.spacing.lg}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.xs}px`,
    textAlign: 'left',
  };

  const finalCtaSectionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: `${theme.spacing.md}px`,
    backgroundColor: theme.colors.surfacePrimary,
    borderRadius: `${theme.borderRadius.lg}px`,
    padding: `${theme.spacing.xl}px ${theme.spacing.lg}px`,
    width: '100%',
    maxWidth: '640px',
  };

  const ctaStyle: React.CSSProperties = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.surface,
    border: 'none',
    borderRadius: `${theme.borderRadius.full}px`,
    padding: `${theme.spacing.md}px ${theme.spacing.xl}px`,
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.lg}px`,
    fontWeight: theme.typography.weights.bold,
    cursor: 'pointer',
  };

  const secondaryCtaStyle: React.CSSProperties = {
    ...ctaStyle,
    backgroundColor: 'transparent',
    color: theme.colors.primary,
    border: `1px solid ${theme.colors.primary}`,
  };

  const footerStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  return (
    <Screen padding={false}>
      <main style={containerStyle} data-testid="landing-page">
        <section style={heroStyle}>
          <img
            src={LOGO_SRC}
            alt={theme.businessName}
            style={logoStyle}
            data-testid="landing-logo"
          />
          <h1 style={titleStyle}>Seu food truck online em minutos</h1>
          <p style={subtitleStyle}>
            Crie o cardápio digital do seu negócio, receba pedidos pelo WhatsApp
            e comece agora com 30 dias grátis, sem cartão de crédito.
          </p>
        </section>

        <section style={highlightsStyle} aria-label="Recursos do produto">
          <FeatureCarousel slides={HIGHLIGHTS} />
        </section>

        <button
          type="button"
          style={ctaStyle}
          data-testid="landing-cta"
          aria-label="Começar teste gratuito"
          onClick={() => navigate('/signup')}
        >
          Começar teste gratuito
        </button>

        <section
          style={stepsSectionStyle}
          aria-label="Como funciona"
          data-testid="landing-steps"
        >
          <h2 style={sectionHeadingStyle}>Como funciona</h2>
          <ol style={stepsListStyle}>
            {STEPS.map((step) => (
              <li key={step.title} style={stepCardStyle}>
                <h3 style={cardTitleStyle}>{step.title}</h3>
                <p style={cardTextStyle}>{step.description}</p>
              </li>
            ))}
          </ol>
          <FeatureModal />
        </section>

        <section
          style={finalCtaSectionStyle}
          aria-label="Comece agora"
          data-testid="landing-final-cta"
        >
          <h2 style={sectionHeadingStyle}>Pronto para começar?</h2>
          <p style={cardTextStyle}>
            Teste gratuito por 30 dias, sem cartão de crédito e sem compromisso.
          </p>
          <button
            type="button"
            style={secondaryCtaStyle}
            data-testid="landing-secondary-cta"
            aria-label="Criar conta gratuita"
            onClick={() => navigate('/signup')}
          >
            Criar conta gratuita
          </button>
        </section>

        <footer data-testid="landing-footer">
          <p style={footerStyle}>© {CURRENT_YEAR} Food Truck App</p>
        </footer>
      </main>
    </Screen>
  );
}
