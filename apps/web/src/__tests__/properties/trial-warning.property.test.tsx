import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TRIAL_WARNING_DAYS } from '@order-system/shared';
import { TrialWarning } from '../../components/TrialWarning';
import { ThemeProvider } from '../../theme';

/**
 * Feature: landing-onboarding, Property 14: Visibilidade do Trial_Warning.
 *
 * Para qualquer número inteiro de dias restantes (`daysRemaining`), o
 * `Trial_Warning` é exibido — informando os dias restantes via
 * `data-testid="trial-warning"` — se e somente se o teste estiver vigente
 * (`daysRemaining > 0`) E os dias restantes forem menores ou iguais a
 * `TRIAL_WARNING_DAYS` (7). Em qualquer outro caso (mais dias que o limite, ou
 * teste já expirado/encerrado) o aviso permanece oculto (`queryByTestId` nulo).
 *
 * O gerador cobre deliberadamente valores abaixo, no e acima do limite, além de
 * `<= 0`, exercitando os dois lados do bicondicional e as fronteiras (1, o
 * próprio limite e limite + 1). Usa `ThemeProvider` porque o componente depende
 * de `useTheme`, e desmonta entre execuções para isolar cada render.
 *
 * **Validates: Requirements 13.1, 13.2**
 */

/**
 * Renderiza o `Trial_Warning` para os dias restantes informados, envolvido pelo
 * `ThemeProvider` (o componente depende de `useTheme`), e devolve o resultado
 * do render.
 */
function renderTrialWarning(daysRemaining: number) {
  return render(
    <ThemeProvider>
      <TrialWarning daysRemaining={daysRemaining} />
    </ThemeProvider>,
  );
}

/**
 * Gera inteiros de dias restantes num intervalo que abrange bem os dois lados da
 * fronteira: de valores negativos/zero (teste expirado) até bem acima do limite
 * de aviso. O intervalo `[-limite - 3, limite * 3]` garante amostragem tanto da
 * zona oculta (`<= 0` e `> TRIAL_WARNING_DAYS`) quanto da zona visível.
 */
function daysRemainingArb(): fc.Arbitrary<number> {
  return fc.integer({ min: -TRIAL_WARNING_DAYS - 3, max: TRIAL_WARNING_DAYS * 3 });
}

/** Predicado de visibilidade esperado (fonte da verdade da propriedade). */
function shouldBeVisible(daysRemaining: number): boolean {
  return daysRemaining > 0 && daysRemaining <= TRIAL_WARNING_DAYS;
}

describe('Property 14: Visibilidade do Trial_Warning', () => {
  it('exibe o aviso (com os dias restantes) sse e somente se 0 < daysRemaining <= TRIAL_WARNING_DAYS', () => {
    fc.assert(
      fc.property(daysRemainingArb(), (daysRemaining) => {
        const { unmount } = renderTrialWarning(daysRemaining);
        try {
          if (shouldBeVisible(daysRemaining)) {
            const warning = screen.getByTestId('trial-warning');
            expect(warning).toBeInTheDocument();
            // O aviso informa os dias restantes (R13.1).
            expect(warning).toHaveTextContent(String(daysRemaining));
          } else {
            expect(screen.queryByTestId('trial-warning')).not.toBeInTheDocument();
          }
        } finally {
          unmount();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('cobre explicitamente as fronteiras (0, 1, limite e limite + 1)', () => {
    const cases: Array<[number, boolean]> = [
      [-1, false],
      [0, false],
      [1, true],
      [TRIAL_WARNING_DAYS, true],
      [TRIAL_WARNING_DAYS + 1, false],
    ];
    for (const [daysRemaining, visible] of cases) {
      const { unmount } = renderTrialWarning(daysRemaining);
      if (visible) {
        expect(screen.getByTestId('trial-warning')).toBeInTheDocument();
      } else {
        expect(screen.queryByTestId('trial-warning')).not.toBeInTheDocument();
      }
      unmount();
    }
  });
});
