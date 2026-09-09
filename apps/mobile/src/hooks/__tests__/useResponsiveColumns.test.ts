/**
 * Regra de colunas responsivas (`useResponsiveColumns`) — fonte única de
 * verdade do layout de cards do app operador.
 *
 * Cobre especialmente o caso do tablet pequeno Samsung SM-T295 (~533 dp em
 * retrato → ~501 dp de área útil), que antes ficava preso em 1 card por linha
 * porque o breakpoint de tablet (700) nunca era alcançado. Também garante que
 * celulares comuns permaneçam em 1 coluna e que os tetos por faixa de largura
 * (2/3/4 colunas) sejam respeitados.
 *
 * O hook é chamado com `availableWidth` (largura útil já sem paddings), de modo
 * que o teste exercita a regra pura sem depender de `useWindowDimensions`.
 */
import { renderHook } from '@testing-library/react-native';

import { useResponsiveColumns } from '../useResponsiveColumns';
import { BREAKPOINTS, CARD_TARGET_WIDTH } from '../../theme/breakpoints';

function columnsFor(availableWidth: number, maxColumns?: number): number {
  const { result } = renderHook(() =>
    useResponsiveColumns({ availableWidth, maxColumns }),
  );
  return result.current;
}

describe('useResponsiveColumns', () => {
  it('mantém celulares comuns em 1 coluna (área útil abaixo do breakpoint)', () => {
    // iPhone/Android típicos: ~360–412 dp de janela; útil ~330–380 dp.
    expect(columnsFor(330)).toBe(1);
    expect(columnsFor(398)).toBe(1); // maior celular comum (~430 dp de janela)
  });

  it('libera 2 colunas no menor tablet suportado (SM-T295 em retrato)', () => {
    // SM-T295: 800 px / densidade ~1.5 ≈ 533 dp de janela; útil ~501 dp após
    // descontar os paddings horizontais do ScrollContainer.
    expect(columnsFor(501)).toBe(2);
  });

  it('trata exatamente o limiar do breakpoint de tablet', () => {
    // Logo abaixo do limiar: ainda celular (1 coluna).
    expect(columnsFor(BREAKPOINTS.tablet - 1)).toBe(1);
    // No limiar: já é tablet e a largura comporta 2 cards-alvo.
    expect(columnsFor(BREAKPOINTS.tablet)).toBe(2);
  });

  it('respeita os tetos de 3 e 4 colunas por faixa de largura', () => {
    expect(columnsFor(BREAKPOINTS.desktop)).toBe(3);
    expect(columnsFor(BREAKPOINTS.wide)).toBe(4);
    // Muito além do último breakpoint: continua limitado a 4.
    expect(columnsFor(BREAKPOINTS.wide * 2)).toBe(4);
  });

  it('nunca excede o maxColumns informado', () => {
    expect(columnsFor(BREAKPOINTS.wide, 2)).toBe(2);
    expect(columnsFor(BREAKPOINTS.desktop, 1)).toBe(1);
  });

  it('a largura-alvo permite 2 cards já no limiar de tablet', () => {
    // Garante coerência entre o breakpoint e a largura-alvo: no limiar deve
    // caber pelo menos 2 cards (senão o tablet voltaria a exibir 1 card).
    expect(Math.floor(BREAKPOINTS.tablet / CARD_TARGET_WIDTH)).toBeGreaterThanOrEqual(2);
  });
});
