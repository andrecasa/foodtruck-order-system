/**
 * Tokens de responsividade (breakpoints de layout) do app mobile.
 *
 * Estes valores NÃO fazem parte do `ThemeConfig` do `@order-system/shared`
 * porque aquele tema é branding por tenant (mesclável e validado por Zod). Os
 * breakpoints são regra de layout do app operador — genéricos, não dependem de
 * tenant — então vivem aqui como fonte única de verdade para todo o mobile.
 *
 * Objetivo (melhoria de UI em tablets): no celular o conteúdo usa a largura
 * inteira (1 coluna); a partir de larguras de tablet, listas de cards passam a
 * exibir mais de um item por linha.
 *
 * Larguras de referência dos principais aparelhos (largura lógica):
 * - iPhone SE/8: 375; iPhone 14/15: ~390–393; Android comuns: 360–412.
 *   Todos ficam abaixo de `TABLET` (700), então continuam em 1 coluna.
 * - iPad retrato: 768–834 → cai em 2 colunas; iPad landscape/tablets grandes:
 *   1024–1194+ → 3 colunas.
 */

/** Breakpoints de largura útil (em px) usados para decidir o número de colunas. */
export const BREAKPOINTS = {
  /** A partir daqui exibimos 2 colunas (tablets em retrato). */
  tablet: 700,
  /** A partir daqui exibimos 3 colunas (tablets em paisagem / telas largas). */
  desktop: 1080,
  /** A partir daqui exibimos 4 colunas (telas muito largas). */
  wide: 1400,
} as const;

/**
 * Largura-alvo (em px) de um card de conteúdo em telas largas. É a largura
 * confortável de leitura pensada no design mobile atual; usada pelo
 * `useResponsiveColumns`/`Grid` para calcular quantas colunas cabem.
 */
export const CARD_TARGET_WIDTH = 360;

/**
 * Largura máxima (em px) do conteúdo centralizado em telas muito largas, para
 * evitar que filtros e cabeçalhos estiquem demais em monitores/PWA.
 */
export const CONTENT_MAX_WIDTH = 1280;
