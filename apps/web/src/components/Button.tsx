import type React from 'react';
import { useTheme } from '../theme';

export type ButtonVariant = 'primary' | 'outline';

export interface ButtonProps {
  /** Texto do botão. */
  title: string;
  /** Variante visual: preenchido (primary) ou contornado (outline). */
  variant?: ButtonVariant;
  /** Tipo do `<button>` (submit em formulários). */
  type?: 'button' | 'submit';
  /** Callback de clique. */
  onClick?: () => void;
  /** Desabilita o botão. */
  disabled?: boolean;
  /** Exibe estado de carregando (desabilita e troca o rótulo). */
  loading?: boolean;
  /** Rótulo exibido durante o carregamento. */
  loadingLabel?: string;
  /** Estica o botão para 100% da largura (CTAs de formulário). */
  fullWidth?: boolean;
  /** Ícone opcional à esquerda (glifo do Material Symbols Outlined). */
  icon?: string;
  /** Rótulo acessível (padrão: `title`). */
  ariaLabel?: string;
  /** `data-testid` do botão. */
  testId?: string;
}

/**
 * Botão reutilizável do `apps/web`, espelhando o `Button` do app mobile
 * (variantes primary/outline, `loading`, `icon`, `fullWidth`) com estilos
 * derivados do tema (`useTheme()`).
 *
 * Design System (Penpot — CTAs): raio `full`, preenchido com `primary` e texto
 * `surface`; contornado com borda `primary` e texto `primary`. Desabilitado usa
 * `surfaceDisabled`/`textDisabled`. Ícone opcional (Material Symbols) herda a cor
 * do texto.
 */
export function Button({
  title,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled = false,
  loading = false,
  loadingLabel = 'Enviando…',
  fullWidth = false,
  icon,
  ariaLabel,
  testId,
}: ButtonProps) {
  const theme = useTheme();

  const isOutline = variant === 'outline';
  const isDisabled = disabled || loading;
  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const backgroundColor = isDisabled
    ? theme.colors.surfaceDisabled
    : isOutline
      ? 'transparent'
      : theme.colors.primary;

  const textColor = isDisabled
    ? theme.colors.textDisabled
    : isOutline
      ? theme.colors.primary
      : theme.colors.surface;

  const borderColor = isDisabled
    ? theme.colors.surfaceDisabled
    : isOutline
      ? theme.colors.primary
      : theme.colors.primary;

  // Espelha o Button (lg) do mobile: altura 44, raio 22, texto 14/regular,
  // ícone 18 herdando a cor do texto; borda só na variante outline.
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: icon ? `${theme.spacing.xs}px` : 0,
    height: '48px',
    padding: `0 ${theme.spacing.lg}px`,
    width: fullWidth ? '100%' : 'auto',
    backgroundColor,
    color: textColor,
    border: isOutline ? `1px solid ${borderColor}` : 'none',
    borderRadius: `${theme.borderRadius.full}px`,
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: '"Material Symbols Outlined"',
    fontSize: `${theme.typography.sizes.lg}px`,
    lineHeight: 0,
    color: textColor,
  };

  return (
    <button
      type={type}
      style={style}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-label={ariaLabel ?? title}
      data-testid={testId}
    >
      {!loading && icon ? (
        <span className="material-symbols-outlined" aria-hidden="true" style={iconStyle}>
          {icon}
        </span>
      ) : null}
      {loading ? loadingLabel : title}
    </button>
  );
}
