import {
  FLOATING_CTA_BOTTOM_OFFSET,
  FLOATING_CTA_HEIGHT,
  FLOATING_STACK_GAP,
  FLOATING_TOTAL_HEIGHT,
  FLOATING_TOTAL_BOTTOM,
  FLOATING_STACK_CONTENT_INSET,
  floatingBackdropStyle,
  floatingTotalStyle,
} from '../../utils/floating-footer';

/**
 * Fixa o layout do rodapé flutuante compartilhado (Total + CTA) usado por
 * CreateOrderScreen, EditOrderItemsScreen e CustomerMenuScreen. Antes, as três
 * telas repetiam os mesmos números mágicos (`16 + 44 + 8 + 48 + 16`); estes
 * testes garantem que os valores derivados e os builders de estilo continuam
 * consistentes com as specs dos componentes (FloatingButton 44 / TotalRow 48).
 */
describe('floating-footer layout', () => {
  it('deriva a âncora do Total a partir do offset + CTA + gap', () => {
    expect(FLOATING_TOTAL_BOTTOM).toBe(
      FLOATING_CTA_BOTTOM_OFFSET + FLOATING_CTA_HEIGHT + FLOATING_STACK_GAP,
    );
    // Valor esperado pelas specs: 16 + 44 + 8.
    expect(FLOATING_TOTAL_BOTTOM).toBe(68);
  });

  it('reserva no scroll a altura do stack mais a folga da base', () => {
    expect(FLOATING_STACK_CONTENT_INSET).toBe(
      FLOATING_TOTAL_BOTTOM + FLOATING_TOTAL_HEIGHT + FLOATING_CTA_BOTTOM_OFFSET,
    );
    // Preserva o valor histórico: 16 + 44 + 8 + 48 + 16.
    expect(FLOATING_STACK_CONTENT_INSET).toBe(132);
  });

  it('posiciona o Total flutuante logo acima do CTA, com a cor recebida', () => {
    const style = floatingTotalStyle('#ABCDEF');
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(FLOATING_TOTAL_BOTTOM);
    expect(style.left).toBe(16);
    expect(style.right).toBe(16);
    expect(style.backgroundColor).toBe('#ABCDEF');
  });

  it('cria o backdrop cobrindo do chão até o topo do Total mais uma folga', () => {
    const style = floatingBackdropStyle('#123456');
    expect(style.position).toBe('absolute');
    expect(style.bottom).toBe(0);
    expect(style.height).toBe(
      FLOATING_TOTAL_BOTTOM + FLOATING_TOTAL_HEIGHT + FLOATING_STACK_GAP,
    );
    // Preserva o valor histórico: 16 + 44 + 8 + 48 + 8.
    expect(style.height).toBe(124);
    expect(style.backgroundColor).toBe('#123456');
  });
});
