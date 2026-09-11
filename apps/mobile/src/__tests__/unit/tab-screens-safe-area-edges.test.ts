import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Guarda de regressão do "espaço entre o último item e a bottom nav" que só
 * aparece no device (onde `insets.bottom > 0`).
 *
 * Telas dentro do navegador de abas (`app/(tabs)`) NÃO podem aplicar o
 * safe-area inset inferior no próprio container: a barra de abas já reserva
 * `insets.bottom` (ver `app/(tabs)/_layout.tsx`). Aplicá-lo de novo duplica o
 * inset e abre o vão.
 *
 * A correção anterior passou despercebida em alguns caminhos de render (o
 * `<Screen>` principal tinha indentação diferente dos estados de loading/erro),
 * então este teste verifica no fonte que TODA abertura de `<Screen` ou
 * `<FormScreen` dessas telas inclui a prop `edges` — cobrindo todos os retornos
 * (loading, erro e principal), não só o primeiro.
 */

const SCREENS_DIR = join(__dirname, '..', '..', 'screens');

/** Telas renderizadas dentro do navegador de abas (bottom nav visível). */
const TAB_SCREENS = [
  'OrderQueueScreen.tsx',
  'CreateOrderScreen.tsx',
  'OperatorQrCodeScreen.tsx',
  'DailySummaryScreen.tsx',
  'MonthlySummaryScreen.tsx',
];

/**
 * Captura cada abertura de tag `<Screen ...>` ou `<FormScreen ...>` (até o `>`),
 * incluindo props multilinha.
 */
function screenOpeningTags(source: string): string[] {
  const matches = source.match(/<(?:Screen|FormScreen)\b[^>]*>/gs);
  return matches ?? [];
}

describe('tab screens não aplicam o inset inferior (edges)', () => {
  for (const file of TAB_SCREENS) {
    it(`${file}: todo <Screen>/<FormScreen> passa a prop edges`, () => {
      const source = readFileSync(join(SCREENS_DIR, file), 'utf8');
      const tags = screenOpeningTags(source);

      // Garante que o teste está mesmo inspecionando as tags esperadas.
      expect(tags.length).toBeGreaterThan(0);

      const semEdges = tags.filter((tag) => !/\bedges=/.test(tag));
      expect(semEdges).toEqual([]);
    });
  }
});
