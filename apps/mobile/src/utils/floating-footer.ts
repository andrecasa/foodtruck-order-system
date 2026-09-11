import type { ViewStyle } from 'react-native';

/**
 * Layout do rodapé flutuante "Total + CTA" — fonte única compartilhada pelas
 * telas de seleção de itens do operador (`CreateOrderScreen`,
 * `EditOrderItemsScreen`) e do cliente (`CustomerMenuScreen`), que empilham um
 * `TotalRow` logo acima de um `FloatingButton` na base da tela, com um painel
 * sólido (backdrop) atrás para o conteúdo rolado não vazar pelas frestas.
 *
 * Antes, cada tela repetia os mesmos números mágicos (`16 + 44 + 8 + 48 + 16`)
 * no `paddingBottom` do conteúdo e no posicionamento absoluto do total/backdrop.
 * Centralizar aqui evita a duplicação e mantém as três telas em sincronia.
 *
 * Os valores espelham as specs dos componentes: `FloatingButton` (altura 44,
 * `bottomOffset` padrão 16) e `TotalRow` (altura 48). O empilhamento é, de baixo
 * para cima: [offset] CTA [gap] Total.
 */

/** Distância do CTA flutuante até a base da tela (`FloatingButton.bottomOffset`). */
export const FLOATING_CTA_BOTTOM_OFFSET = 16;

/** Altura do CTA flutuante (`FloatingButton`). */
export const FLOATING_CTA_HEIGHT = 44;

/** Espaço vertical entre o CTA e o Total (e folga do backdrop acima do Total). */
export const FLOATING_STACK_GAP = 8;

/** Altura da linha de Total (`TotalRow`). */
export const FLOATING_TOTAL_HEIGHT = 48;

/** Distância da base até o topo do Total flutuante (onde ele é ancorado). */
export const FLOATING_TOTAL_BOTTOM =
  FLOATING_CTA_BOTTOM_OFFSET + FLOATING_CTA_HEIGHT + FLOATING_STACK_GAP;

/**
 * Espaço reservado no fim do scroll para o último item não ficar sob o rodapé
 * flutuante. Reserva a altura total do stack (Total + CTA) mais uma folga igual
 * ao offset da base.
 */
export const FLOATING_STACK_CONTENT_INSET =
  FLOATING_TOTAL_BOTTOM + FLOATING_TOTAL_HEIGHT + FLOATING_CTA_BOTTOM_OFFSET;

/**
 * Painel sólido de largura total atrás do Total + CTA, para nenhum conteúdo
 * rolado aparecer nas frestas. A altura vai da base até o topo do Total mais uma
 * folga (`FLOATING_STACK_GAP`).
 *
 * @param backgroundColor cor de fundo da tela (`theme.colors.background`).
 */
export function floatingBackdropStyle(backgroundColor: string): ViewStyle {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: FLOATING_TOTAL_BOTTOM + FLOATING_TOTAL_HEIGHT + FLOATING_STACK_GAP,
    backgroundColor,
  };
}

/**
 * Container do Total flutuante — ancorado logo acima do CTA. Usa um tint opaco
 * (mesmo visual do `TotalRow`) para o conteúdo rolado não vazar por baixo.
 *
 * @param backgroundColor tint de fundo do Total (`theme.colors.surfacePrimary`).
 */
export function floatingTotalStyle(backgroundColor: string): ViewStyle {
  return {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: FLOATING_TOTAL_BOTTOM,
    backgroundColor,
    borderRadius: 8,
  };
}
