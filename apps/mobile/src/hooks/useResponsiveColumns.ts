import { useWindowDimensions } from 'react-native';
import { BREAKPOINTS, CARD_TARGET_WIDTH } from '../theme/breakpoints';

/** Opções do cálculo responsivo de colunas. */
export interface ResponsiveColumnsOptions {
  /**
   * Largura-alvo de cada item, em px. Quantas colunas cabem é derivado desta
   * largura sobre a largura disponível. Padrão: `CARD_TARGET_WIDTH` (360).
   */
  minItemWidth?: number;
  /**
   * Largura disponível para o conteúdo, em px. Quando informada, o cálculo usa
   * este valor em vez da largura da janela — necessário quando a área útil
   * desconta paddings do `Screen`/`ScrollContainer`.
   */
  availableWidth?: number;
  /** Teto de colunas, para não exceder o desejado em telas muito largas. */
  maxColumns?: number;
}

/**
 * Fonte única da regra "quantas colunas nesta largura".
 *
 * No celular retorna 1 coluna (o conteúdo usa a largura inteira); a partir dos
 * breakpoints de tablet passa a permitir múltiplas colunas, limitado pela
 * quantidade de itens de `minItemWidth` que cabem na largura disponível.
 *
 * Toda tela responsiva (via `Grid` ou via `numColumns` da `FlatList`) deve
 * consumir este hook, para que a regra de layout viva num único lugar.
 *
 * @returns número de colunas (>= 1)
 */
export function useResponsiveColumns(options: ResponsiveColumnsOptions = {}): number {
  const { minItemWidth = CARD_TARGET_WIDTH, availableWidth, maxColumns } = options;
  const { width: windowWidth } = useWindowDimensions();
  const width = availableWidth ?? windowWidth;

  // Abaixo do primeiro breakpoint (todo celular): sempre 1 coluna.
  if (width < BREAKPOINTS.tablet) return 1;

  // Teto de colunas por faixa de largura (evita colunas demais em telas largas).
  let cap: number;
  if (width >= BREAKPOINTS.wide) cap = 4;
  else if (width >= BREAKPOINTS.desktop) cap = 3;
  else cap = 2;

  // Quantos itens da largura-alvo cabem de fato na largura disponível.
  const fit = Math.max(1, Math.floor(width / minItemWidth));

  const columns = Math.min(cap, fit, maxColumns ?? cap);
  return Math.max(1, columns);
}
