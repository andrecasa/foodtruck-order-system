import React from 'react';
import { TRIAL_WARNING_DAYS } from '@order-system/shared';
import { useTheme } from '../theme';

export interface TrialWarningProps {
  /**
   * Dias corridos restantes até o fim do `Trial_Period`, calculado pelo caller
   * (componente puramente apresentacional). Um valor `<= 0` indica teste
   * expirado/encerrado — nesse caso o aviso permanece oculto, pois o requisito
   * cobre apenas o teste "vigente" (R13.1/R13.2).
   */
  daysRemaining: number;
}

/**
 * Aviso de expiração do período de teste (`Trial_Warning`).
 *
 * Regra de visibilidade (R13.1/R13.2 — Correctness Property 14): o aviso é
 * exibido, informando os dias restantes, se e somente se o teste estiver vigente
 * (`daysRemaining > 0`) E os dias restantes forem menores ou iguais a
 * `TRIAL_WARNING_DAYS` (7, de `@order-system/shared`). Em qualquer outro caso
 * (mais dias que o limite, ou teste expirado) o componente permanece oculto
 * retornando `null`.
 *
 * Componente puro/apresentacional: quem consome calcula `daysRemaining` a partir
 * de `trial_ends_at` e do instante atual — o backend é a autoridade final sobre
 * o estado do trial.
 *
 * Acessibilidade: `role="status"` + `aria-live="polite"` para que leitores de
 * tela anunciem o aviso sem interromper o usuário; ícone decorativo oculto.
 */
export function TrialWarning({ daysRemaining }: TrialWarningProps) {
  // Hooks são chamados incondicionalmente, antes de qualquer retorno antecipado,
  // para manter a mesma ordem em todo render (rules-of-hooks).
  const theme = useTheme();

  // Oculto quando o teste não está vigente (expirado/encerrado) ou quando ainda
  // faltam mais dias que o limite de aviso (R13.2).
  if (daysRemaining <= 0 || daysRemaining > TRIAL_WARNING_DAYS) {
    return null;
  }

  const message =
    daysRemaining === 1
      ? 'Seu período de teste termina em 1 dia.'
      : `Seu período de teste termina em ${daysRemaining} dias.`;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderRadius: `${theme.borderRadius.sm}px`,
    backgroundColor: theme.colors.surfaceRevenue,
    color: theme.colors.warning,
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    boxSizing: 'border-box',
  };

  const iconStyle: React.CSSProperties = {
    fontSize: `${theme.typography.sizes.xl}px`,
    color: theme.colors.warning,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="trial-warning"
      style={containerStyle}
    >
      <span className="material-symbols-outlined" style={iconStyle} aria-hidden="true">
        schedule
      </span>
      <span>{message}</span>
    </div>
  );
}
