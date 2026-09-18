import type React from 'react';
import { useId, useState } from 'react';
import { useTheme } from '../theme';

export interface InputProps {
  /** Rótulo do campo (sempre usado como rótulo acessível). */
  label: string;
  /**
   * Oculta o rótulo visual, mantendo-o apenas para leitores de tela (via
   * `aria-label`). Útil em telas como o login, onde o campo usa só o placeholder
   * + ícone, como no app mobile.
   */
  hideLabel?: boolean;
  /** Valor atual do campo (controlado). */
  value: string;
  /** Callback ao alterar o texto. */
  onChangeText: (text: string) => void;
  /** Placeholder do campo. */
  placeholder?: string;
  /** Mensagem de erro exibida abaixo do campo (com `role="alert"`). */
  error?: string;
  /** Texto de ajuda exibido abaixo do campo (quando não há erro). */
  helpText?: string;
  /** Tipo do input HTML (text, email, password, tel...). */
  type?: React.HTMLInputTypeAttribute;
  /** Ícone opcional à esquerda (glifo do Material Symbols Outlined). */
  icon?: string;
  /** `data-testid` do input. */
  testId?: string;
  /** `autoComplete` nativo. */
  autoComplete?: string;
  /** `inputMode` nativo (ex.: 'email', 'tel'). */
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  /** Desabilita a autocapitalização/correção (útil para slug/e-mail). */
  disableAutoCorrect?: boolean;
  /** Desabilita o campo. */
  disabled?: boolean;
  /** Conteúdo à direita do campo (ex.: status de disponibilidade). */
  children?: React.ReactNode;
}

/**
 * Campo de formulário reutilizável do `apps/web`, espelhando o `Input` do app
 * mobile (label, campo, mensagem de erro e acessibilidade), com estilos 100%
 * derivados do tema (`useTheme()`).
 *
 * Especificações do Design System (Penpot — Signup): wrapper em coluna (gap
 * `xs`); label 12/500 na cor de texto; campo com fundo `surfacePrimary`, raio
 * `md`, altura fixa e padding horizontal `md`; borda que reflete foco (primary)
 * e erro (error); placeholder em `textSecondary`. Ícone opcional à esquerda e,
 * para `type="password"`, um toggle de visibilidade (olho) à direita — como no
 * app mobile. Mensagem de erro com `role="alert"` + `aria-live`.
 */
export function Input({
  label,
  hideLabel = false,
  value,
  onChangeText,
  placeholder,
  error,
  helpText,
  type = 'text',
  icon,
  testId,
  autoComplete,
  inputMode,
  disableAutoCorrect = false,
  disabled = false,
  children,
}: InputProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helpId = `${inputId}-help`;

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    // Mobile: wrapper com gap 8px entre label e campo.
    gap: `${theme.spacing.sm}px`,
    width: '100%',
  };

  // Espelha o Input do mobile: label 12/regular, campo raio 24, altura 52,
  // fundo `surface`, borda que reflete foco/erro, ícone/placeholder 14.
  const labelStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.sm}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
  };

  const borderColor = error
    ? theme.colors.error
    : focused
      ? theme.colors.primary
      : theme.colors.border;

  const fieldStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: `${theme.spacing.sm}px`,
    backgroundColor: theme.colors.surface,
    border: `1px solid ${borderColor}`,
    borderRadius: `${theme.borderRadius.md}px`,
    height: '52px',
    padding: `0 ${theme.spacing.md}px`,
    boxSizing: 'border-box',
    opacity: disabled ? 0.6 : 1,
  };

  const iconStyle: React.CSSProperties = {
    fontFamily: '"Material Symbols Outlined"',
    fontSize: `${theme.typography.sizes.xl}px`,
    lineHeight: 0,
    color: theme.colors.textSecondary,
    flexShrink: 0,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 0,
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.text,
  };

  const errorStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.xs}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.error,
    // Mobile: mensagem de erro com marginTop `xs`.
    margin: `${theme.spacing.xs}px 0 0`,
  };

  const helpStyle: React.CSSProperties = {
    ...errorStyle,
    color: theme.colors.textSecondary,
  };

  // Campo de senha ganha um toggle de visibilidade (olho), como no mobile.
  const isPassword = type === 'password';
  const resolvedType = isPassword && passwordVisible ? 'text' : type;

  const toggleStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    flexShrink: 0,
    lineHeight: 0,
  };

  return (
    <div style={containerStyle}>
      {hideLabel ? null : (
        <label htmlFor={inputId} style={labelStyle}>
          {label}
        </label>
      )}
      <div style={fieldStyle}>
        {icon ? (
          <span className="material-symbols-outlined" aria-hidden="true" style={iconStyle}>
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          type={resolvedType}
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          disabled={disabled}
          data-testid={testId}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : helpText ? helpId : undefined}
          autoComplete={autoComplete}
          inputMode={inputMode}
          {...(disableAutoCorrect
            ? { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }
            : null)}
          style={inputStyle}
        />
        {isPassword ? (
          <button
            type="button"
            style={toggleStyle}
            onClick={() => setPasswordVisible((prev) => !prev)}
            aria-label={passwordVisible ? 'Ocultar senha' : 'Exibir senha'}
            aria-pressed={passwordVisible}
            tabIndex={-1}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={iconStyle}>
              {passwordVisible ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        ) : null}
        {children}
      </div>
      {error ? (
        <p id={errorId} style={errorStyle} role="alert" aria-live="polite">
          {error}
        </p>
      ) : helpText ? (
        <p id={helpId} style={helpStyle}>
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
