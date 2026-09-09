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
 * Larguras de referência dos principais aparelhos (largura lógica em dp):
 * - iPhone SE/8: 375; iPhone 14/15: ~390–393; Android comuns: 360–412;
 *   phablets grandes: ~430. Em retrato a área útil de todos fica abaixo de
 *   `TABLET` (480), então continuam em 1 coluna.
 * - Tablets 7–8" (ex.: Samsung SM-T295, ~533 dp em retrato → ~501 dp úteis):
 *   passam a 2 colunas — antes ficavam presos em 1 card porque o breakpoint de
 *   700 nunca era alcançado.
 * - iPad retrato: 768–834 → 2 colunas; iPad landscape / tablets grandes:
 *   1024–1194+ → 3 colunas.
 */

/** Breakpoints de largura útil (em px) usados para decidir o número de colunas. */
export const BREAKPOINTS = {
  /**
   * A partir daqui exibimos 2 colunas (tablets em retrato, incl. 7–8").
   *
   * O valor é comparado com a LARGURA ÚTIL (após descontar paddings). No maior
   * celular comum (~430 dp) a área útil fica em ~398 dp; no retrato de um tablet
   * pequeno como o Samsung SM-T295 (~533 dp) fica em ~501 dp. 480 separa os dois
   * casos, mantendo celulares em 1 coluna e liberando 2 colunas no tablet.
   */
  tablet: 480,
  /** A partir daqui exibimos 3 colunas (tablets em paisagem / telas largas). */
  desktop: 1080,
  /** A partir daqui exibimos 4 colunas (telas muito largas). */
  wide: 1400,
} as const;

/**
 * Largura-alvo (em px) de um card de conteúdo em telas largas. É a largura
 * confortável mínima por card; usada pelo `useResponsiveColumns`/`Grid` para
 * calcular quantas colunas cabem (`floor(largura / CARD_TARGET_WIDTH)`).
 *
 * Mantida em 240 (não 360) para que, no menor tablet suportado (SM-T295 em
 * retrato, ~501 dp de área útil), o piso `floor(501 / 240) = 2` renda de fato 2
 * colunas — com 360 o piso dava 1 e o tablet ficava com um único card por linha.
 */
export const CARD_TARGET_WIDTH = 240;

/**
 * Largura máxima (em px) do conteúdo centralizado em telas muito largas, para
 * evitar que filtros e cabeçalhos estiquem demais em monitores/PWA.
 */
export const CONTENT_MAX_WIDTH = 1280;
