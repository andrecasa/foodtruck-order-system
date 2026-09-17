import type React from 'react';
import { useNavigate } from 'react-router';
import { useTheme } from '../theme';
import { Screen, ImageCarousel, NavDrawer } from '../components';
import type { ImageCarouselSlide } from '../components';
import { useMediaQuery } from '../hooks/useMediaQuery';

/**
 * Landing_Page pública de divulgação do produto (R1), gerada a partir do frame
 * "Landing" do Penpot (página "Landing Page").
 *
 * Estrutura em coluna, fiel ao design: Navbar, Hero, e três seções de
 * funcionalidade (Central de Pedidos, Resumo Financeiro e Geolocalização),
 * encerrando no rodapé. O mockup de cada seção alterna de lado — à esquerda no
 * Resumo Financeiro e à direita nas demais — como no Penpot.
 *
 * É renderizada sem exigir autenticação (R1.3): não depende de nenhum hook de
 * auth nem faz chamadas protegidas. O CTA principal ("Começar grátis") inicia o
 * onboarding navegando para `/signup` via `useNavigate` do Web_Router (R1.1/R1.2);
 * o Signup_Form em si está fora do escopo desta entrega.
 *
 * Todos os valores de estilo derivam do tema (`useTheme()`), sem cores/tamanhos
 * hardcoded. Onde o Design System não tem um token exato (ex.: display do hero
 * de 40px e respiros de 48/64px), derivamos múltiplos coerentes do maior token
 * disponível, documentando a origem. As imagens são placeholders em
 * `public/assets/landing/` (SVG rotulado) e serão substituídas pelas finais.
 */

/** Logomarca da marca, servida da pasta `public/` do Vite (URL raiz). */
const LOGO_SRC = '/assets/logo.png';

/** Imagem (placeholder) de fundo do hero, servida da pasta `public/`. */
const HERO_BACKGROUND_SRC = '/assets/landing/hero/hero.png';

/** Opacidade do overlay escuro sobre a foto do hero (contraste do texto). */
const HERO_OVERLAY = 'linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.3))';

/** Largura máxima do conteúdo centralizado (frame do Penpot ~1200px). */
const CONTENT_MAX_WIDTH = 1120;

/** Largura máxima do parágrafo/subtítulo do hero, como no design (640px). */
const HERO_TEXT_MAX_WIDTH = 640;

/** Ano exibido no rodapé, calculado a partir da data atual. */
const CURRENT_YEAR = new Date().getFullYear();

/** Intervalo (ms) do autoplay dos carrosséis de mockups (10s). */
const CAROUSEL_AUTOPLAY_MS = 10_000;

/** Altura fixa (px) dos carrosséis de mockups (em teste). */
const CAROUSEL_HEIGHT_PX = 450;

/**
 * Abaixo desta largura a navbar troca os links inline por hambúrguer + drawer,
 * evitando a quebra do menu no mobile.
 */
const NAVBAR_MOBILE_QUERY = '(max-width: 768px)';

/**
 * Links de navegação do topo (marketing). Cada rótulo leva à sua seção
 * correspondente na própria página, via âncora (`#id-da-seção`).
 */
const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Central de Pedidos', href: '#central-pedidos' },
  { label: 'Resumo Financeiro', href: '#resumo-financeiro' },
  { label: 'Geolocalização', href: '#geolocalizacao' },
];

/** Provas rápidas exibidas abaixo dos CTAs do hero (ícone + rótulo). */
const HERO_PROOFS: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'bolt', label: 'Tempo real' },
  { icon: 'qr_code_2', label: 'Pedidos por QR Code' },
  { icon: 'palette', label: 'Com a sua marca' },
];

/** Card de destaque dentro de uma seção de funcionalidade. */
interface FeatureCard {
  title: string;
  subtitle: string;
  bullets: readonly string[];
}

/** Dados de uma seção de funcionalidade (mockup + cards). */
interface FeatureSectionData {
  id: string;
  title: string;
  subtitle: string;
  paragraph: string;
  /** Glifo do Material Symbols exibido no badge ao lado do título (ver Penpot). */
  icon: IconName;
  /** Fundo da seção: branco (`surface`) ou cinza claro (`surfacePrimary`). */
  variant: 'surface' | 'surfacePrimary';
  /** Imagens do carrossel de mockups (uma ou mais). */
  mockups: ReadonlyArray<ImageCarouselSlide>;
  /** Lado do mockup em telas largas (alterna conforme o Penpot). */
  mockupSide: 'left' | 'right';
  /** Largura máxima do carrossel (px). Padrão: board de 441 do Penpot. */
  mockupMaxWidth?: number;
  /** Proporção do slide (aspect-ratio). Padrão: 441/550 do Penpot. */
  mockupAspectRatio?: string;
  cards: readonly FeatureCard[];
}

/**
 * Conteúdo das três seções de funcionalidade, na ordem do design. O texto é
 * copy de divulgação; não altera o contrato de navegação da página.
 */
const FEATURE_SECTIONS: ReadonlyArray<FeatureSectionData> = [
  {
    id: 'central-pedidos',
    title: 'Central de Pedidos',
    subtitle: 'seu negócio na palma da mão',
    paragraph:
      'Cada pessoa do seu time no lugar certo, com a ferramenta certa. O atendente comanda o balcão pelo celular, o preparador acompanha a cozinha na tela que preferir - tablet, computador ou o próprio celular - e os dois trabalham na mesma fila, atualizada em tempo real. Nada se perde entre o pedido e o prato.',
    icon: 'receipt_long',
    variant: 'surface',
    mockups: [
      {
        src: '/assets/landing/carousel/mockup-login.png',
        alt: 'Tela de login do aplicativo',
      },
      {
        src: '/assets/landing/carousel/mockup-pedidos.png',
        alt: 'Tela da fila de pedidos no aplicativo',
      },
      {
        src: '/assets/landing/carousel/mockup-pedido.png',
        alt: 'Tela de detalhe de um pedido no aplicativo',
      },
      {
        src: '/assets/landing/carousel/mockup-pedido-confirmacao.png',
        alt: 'Tela de confirmação de um pedido no aplicativo',
      },
      {
        src: '/assets/landing/carousel/mockup-pedido-pagamento.png',
        alt: 'Tela de pagamento de um pedido no aplicativo',
      },        
    ],
    mockupSide: 'right',
    cards: [
      {
        title: 'A frente de caixa na palma da mão',
        subtitle:
          'Quem recebe o cliente resolve tudo pelo celular, sem sair do balcão.',
        bullets: [
          'Monte pedidos em segundos tocando no cardápio',
          'Edite itens enquanto o pedido está aguardando',
          'Registre pagamento em dinheiro, PIX ou cartão',
          'Acompanhe o que já foi pago e o que está pendente',
        ],
      },
      {
        title: 'A cozinha no seu ritmo, em qualquer tela',
        subtitle:
          'Acompanhe a fila na tela que já tem à mão e prepare sem tocar em papel.',
        bullets: [
          'Painel de preparo em tablet, computador ou celular',
          'Avance o status com um toque, sem digitar',
          'Tudo em sincronia com o balcão, em tempo real',
          'Visão limpa: só o que preparar e o que já pode sair',
        ],
      },
    ],
  },
  {
    id: 'resumo-financeiro',
    title: 'Resumo Financeiro',
    subtitle: 'seu negócio em um piscar de olhos',
    paragraph:
      'Você sabe quanto vendeu hoje e o que mais saiu do balcão? Aqui o dinheiro e os campeões de venda ficam na ponta do dedo: acompanhe o faturamento do dia ao mês e descubra quais produtos puxam o seu resultado - tudo pronto, sem planilha e sem adivinhação.',
    icon: 'monitoring',
    variant: 'surfacePrimary',
    mockups: [
      {
        src: '/assets/landing/carousel/mockup-resumo-diario.png',
        alt: 'Tela do resumo diário do Resumo Financeiro',
      },
      {
        src: '/assets/landing/carousel/mockup-resumo-diario-top10.png',
        alt: 'Tela dos tops 10 produtos mais vendidos - diário',
      },
    ],
    mockupSide: 'left',
    cards: [
      {
        title: 'Esqueça a planilha e a calculadora no fim do dia.',
        subtitle:
          'Seu faturamento aparece pronto, atualizado e sempre à mão - do movimento de hoje ao fechamento do mês.',
        bullets: [
          'Fechou o dia, já sabe o resultado',
          'O mês inteiro em uma tela',
          'Recebido, pendente e faturamento lado a lado',
          'Zero trabalho manual: sem planilha, sem somar',
        ],
      },
      {
        title: 'Top 10 produtos mais vendidos',
        subtitle:
          'Saiba o que faz sucesso no seu balcão e transforme isso em mais lucro.',
        bullets: [
          'Seu ranking de campeões, do mais vendido ao menos',
          'Filtre por categoria e compare cada grupo',
          'Aposte no que vende: combos e promoções',
          'Corte o que não gira e compre com mais precisão',
        ],
      },
    ],
  },
  {
    id: 'geolocalizacao',
    title: 'Geolocalização',
    subtitle: 'descubra onde você fatura mais',
    paragraph:
      'Seu ponto de hoje foi melhor que o da semana passada? Pare de decidir no achismo. Cada pedido marca no mapa de onde veio e o sistema mostra onde você realmente vende mais - para você estacionar nos lugares certos e faturar mais em cada parada.',
    icon: 'pin_drop',
    variant: 'surface',
    mockups: [
      {
        src: '/assets/landing/carousel/mockup-resumo-mensal.png',
        alt: 'Tela de geolocalização dos pedidos no mapa',
      },
    ],
    mockupSide: 'right',
    // Board menor no Penpot (301x375) → carrossel com 375px de altura.
    mockupMaxWidth: 301,
    mockupAspectRatio: '301 / 375',
    cards: [
      {
        title: 'Descubra onde você fatura mais',
        subtitle:
          'Food truck que se preza muda de ponto — e cada pedido vira inteligência de negócio.',
        bullets: [
          'Cada pedido guarda a localização de onde foi feito',
          'Estatísticas por local: veja onde vende e fatura melhor',
          'Decida onde estacionar com base em dados, não no achismo',
          'Descubra novos pontos de ouro e abra novas praças antes da concorrência',
        ],
      },
    ],
  },
];

/**
 * Nomes dos ícones usados na página. São os próprios glifos do Material Symbols
 * Outlined (mesmos nomes referenciados no Penpot), fonte de ícones do
 * `apps/web`. Os chevrons do carrossel são a única exceção (SVG), por ficarem no
 * `ImageCarousel`.
 */
type IconName =
  | 'bolt'
  | 'qr_code_2'
  | 'palette'
  | 'login'
  | 'check'
  | 'receipt_long'
  | 'monitoring'
  | 'pin_drop';

/**
 * Ícone do Design System do `apps/web`: glifo do Material Symbols Outlined
 * (fonte já carregada no `index.html` e usada em `TrialWarning`). É decorativo
 * (`aria-hidden`); herda a cor do elemento pai e o tamanho vem de `size`
 * (via `font-size`), que deve receber um token de `typography.sizes`.
 */
function Icon({ name, size }: { name: IconName; size: number }) {
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

/**
 * Página de divulgação (Landing) montada a partir do design do Penpot.
 */
export function LandingPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const isMobile = useMediaQuery(NAVBAR_MOBILE_QUERY);

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  // Respiros e tamanhos sem token exato no DS: derivados do maior token (xl=32 /
  // xxl=32) para preservar a proporção do design sem valores mágicos.
  const spaceSection = theme.spacing.xl * 1.5; // 48px — respiro vertical/horizontal das seções
  const spaceHero = theme.spacing.xl * 2; // 64px — respiro vertical do hero
  const heroDisplaySize = theme.typography.sizes.xxl * 1.25; // 40px — display do hero

  // No mobile, reduz os respiros laterais (e o vertical do hero) para o conteúdo
  // não ficar espremido por margens grandes demais.
  const sidePadding = isMobile ? theme.spacing.md : theme.spacing.xl;
  const sectionSidePadding = isMobile ? theme.spacing.md : spaceSection;
  const heroVerticalPadding = isMobile ? theme.spacing.xl : spaceHero;

  // Cabeçalho das seções reduzido no mobile. O DS não tem tokens intermediários,
  // então o título usa um múltiplo coerente de `xl` (24px); subtítulo e parágrafo
  // descem um passo de token (xl→lg e lg→md).
  const blockTitleSize = isMobile
    ? theme.typography.sizes.xl * 1.2 // 24px
    : theme.typography.sizes.xxl; // 32px
  const blockSubtitleSize = isMobile
    ? theme.typography.sizes.lg // 16px
    : theme.typography.sizes.xl; // 20px
  const blockParagraphSize = isMobile
    ? theme.typography.sizes.md // 14px
    : theme.typography.sizes.lg; // 16px

  // Badge (círculo azul + ícone branco) ao lado do título/subtítulo, como no
  // Penpot. Diâmetro reduzido no mobile; o ícone acompanha o tamanho do título.
  const badgeSize = isMobile ? 48 : 64;
  const badgeIconSize = blockTitleSize;

  // const goToSignup = () => navigate('/signup');
   const goToSignup = () => navigate('/');

  // --- Navbar -------------------------------------------------------------
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

  // --- Hero ---------------------------------------------------------------
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
    // No mobile os CTAs quebram em linhas; aumenta o respiro vertical entre eles.
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
    color: theme.colors.surface,
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

  // --- Seções de funcionalidade ------------------------------------------
  const sectionStyle = (variant: FeatureSectionData['variant']): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 0,
    width: '100%',
    boxSizing: 'border-box',
    padding: `${theme.spacing.xl}px ${sectionSidePadding}px`,
    backgroundColor:
      variant === 'surface' ? theme.colors.surface : theme.colors.surfacePrimary,
  });

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: `${theme.spacing.sm}px`,
    // Mesma largura do corpo da seção (mockup + cards), para o texto de
    // descrição acompanhar a largura das divs de conteúdo.
    width: '100%',
    maxWidth: `${CONTENT_MAX_WIDTH}px`,
    textAlign: 'left',
  };

  // Linha do cabeçalho: badge à esquerda + coluna (título/subtítulo).
  const headingRowStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: `${theme.spacing.md}px`,
    width: '100%',
  };

  // Badge circular: fundo na cor primária e ícone branco (herdado via `color`).
  const badgeStyle: React.CSSProperties = {
    flexShrink: 0,
    width: `${badgeSize}px`,
    height: `${badgeSize}px`,
    borderRadius: `${theme.borderRadius.full}px`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.surface,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const headingTextStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.xs}px`,
    minWidth: 0,
  };

  const blockTitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${blockTitleSize}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const blockSubtitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${blockSubtitleSize}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  const blockParagraphStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${blockParagraphSize}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
    // Aumenta o espaço entre o subtítulo e o parágrafo (soma-se ao gap do
    // cabeçalho de `sm`, totalizando ~24px).
    margin: `${theme.spacing.md}px 0 0`,
    lineHeight: 1.7,
  };

  const sectionBodyStyle = (side: FeatureSectionData['mockupSide']): React.CSSProperties => ({
    display: 'flex',
    // DOM na ordem [mockup, cards]: para o mockup ficar à direita ele precisa
    // vir por último visualmente (row-reverse); à esquerda mantém a ordem (row).
    flexDirection: side === 'right' ? 'row-reverse' : 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: `${theme.spacing.lg}px`,
    width: '100%',
    maxWidth: `${CONTENT_MAX_WIDTH}px`,
  });

  // Container do carrossel de mockups: define o dimensionamento no fluxo da
  // seção (o `ImageCarousel` preenche 100% e cuida do próprio arredondamento).
  // A largura máxima vem do board do Penpot da seção (padrão 441).
  const mockupContainerStyle = (maxWidth = 441): React.CSSProperties => ({
    flex: '1 1 320px',
    maxWidth: `${maxWidth}px`,
    width: '100%',
    minWidth: 0,
  });

  const cardsColumnStyle: React.CSSProperties = {
    flex: '1 1 320px',
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.lg}px`,
    minWidth: 0,
  };

  const cardStyle = (variant: FeatureSectionData['variant']): React.CSSProperties => ({
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.sm}px`,
    // Contraste do card em relação ao fundo da seção: usa o "outro" tom.
    backgroundColor:
      variant === 'surface' ? theme.colors.surfacePrimary : theme.colors.surface,
    borderRadius: `${theme.borderRadius.md}px`,
    padding: `${theme.spacing.lg}px`,
  });

  const cardTitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.xl}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const cardSubtitleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
  };

  const bulletsStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.sm}px`,
    listStyle: 'none',
    margin: 0,
    padding: 0,
  };

  const bulletStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: `${theme.spacing.xs}px`,
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
    lineHeight: 1.4,
  };

  // Centraliza o glifo na altura de UMA linha do texto (1.4em ≈ altura de linha
  // do bullet), evitando o deslocamento vertical do ícone quando o texto quebra.
  const bulletIconStyle: React.CSSProperties = {
    color: theme.colors.success,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    height: '1.4em',
  };

  // --- Footer -------------------------------------------------------------
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

  const pageStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minHeight: '100vh',
  };

  return (
    <Screen padding={false}>
      <div style={pageStyle} data-testid="landing-page">
        <header style={navbarStyle} data-testid="landing-navbar">
          <div style={navLeftStyle}>
            <div style={brandStyle}>
              <img src={LOGO_SRC} alt={theme.businessName} style={navLogoStyle} />
              <span style={brandNameStyle}>{theme.businessName}</span>
            </div>
            {!isMobile && (
              <nav aria-label="Navegação principal">
                <ul style={navLinksStyle}>
                  {NAV_LINKS.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} style={navLinkStyle} data-testid={`landing-nav-${link.href.slice(1)}`}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          {isMobile ? (
            <NavDrawer links={NAV_LINKS} onLogin={goToSignup} />
          ) : (
            <button
              type="button"
              style={loginButtonStyle}
              data-testid="landing-login"
              aria-label="Entrar na sua conta"
              onClick={goToSignup}
            >
              <Icon name="login" size={theme.typography.sizes.xl} />
              Login
            </button>
          )}
        </header>

        <main style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <section style={heroStyle} data-testid="landing-hero" aria-labelledby="landing-hero-title">
            <h1 id="landing-hero-title" style={heroTitleStyle}>
              Coloque seu negócio para rodar
            </h1>
            <p style={heroSubtitleStyle}>
              Seu time opera pelo celular, seus clientes pedem sozinhos pelo QR
              Code e você enxerga o negócio inteiro em tempo real — do primeiro
              pedido ao faturamento do mês.
            </p>
            <div style={heroCtasStyle}>
              <button
                type="button"
                style={primaryCtaStyle}
                data-testid="landing-cta"
                onClick={goToSignup}
              >
                Começar grátis
              </button>
              <a href="#central-pedidos" style={outlineCtaStyle} data-testid="landing-secondary-cta">
                Ver como funciona
              </a>
            </div>
            <ul style={heroProofsStyle} aria-label="Diferenciais do produto">
              {HERO_PROOFS.map((proof) => (
                <li key={proof.label} style={heroProofStyle}>
                  <Icon name={proof.icon} size={theme.typography.sizes.xl} />
                  {proof.label}
                </li>
              ))}
            </ul>
          </section>

          {FEATURE_SECTIONS.map((section) => (
            <section
              key={section.id}
              id={section.id}
              style={sectionStyle(section.variant)}
              data-testid={`landing-section-${section.id}`}
              aria-labelledby={`${section.id}-title`}
            >
              <div style={sectionHeaderStyle}>
                <div style={headingRowStyle}>
                  <span style={badgeStyle} aria-hidden="true">
                    <Icon name={section.icon} size={badgeIconSize} />
                  </span>
                  <div style={headingTextStyle}>
                    <h2 id={`${section.id}-title`} style={blockTitleStyle}>
                      {section.title}
                    </h2>
                    <p style={blockSubtitleStyle}>{section.subtitle}</p>
                  </div>
                </div>
                <p style={blockParagraphStyle}>{section.paragraph}</p>
              </div>

              <div style={sectionBodyStyle(section.mockupSide)}>
                <div style={mockupContainerStyle(section.mockupMaxWidth)}>
                  <ImageCarousel
                    slides={section.mockups}
                    testId={`landing-mockup-${section.id}`}
                    ariaLabel={`Telas do aplicativo: ${section.title}`}
                    autoplayIntervalMs={CAROUSEL_AUTOPLAY_MS}
                    aspectRatio={section.mockupAspectRatio}
                    height={CAROUSEL_HEIGHT_PX}
                  />
                </div>
                <div style={cardsColumnStyle}>
                  {section.cards.map((card) => (
                    <article key={card.title} style={cardStyle(section.variant)}>
                      <h3 style={cardTitleStyle}>{card.title}</h3>
                      <p style={cardSubtitleStyle}>{card.subtitle}</p>
                      <ul style={bulletsStyle}>
                        {card.bullets.map((bullet) => (
                          <li key={bullet} style={bulletStyle}>
                            <span style={bulletIconStyle}>
                              <Icon name="check" size={theme.typography.sizes.lg} />
                            </span>
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            </section>
          ))}
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
