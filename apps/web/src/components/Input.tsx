import React, { useId } from 'react';
import { useTheme } from '../theme/ThemeProvider';

export type InputMask = 'currency' | 'none';

export interface InputProps {
  /** Label text displayed above the input */
  label: string;
  /** Current input value */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Input mask type */
  mask?: InputMask;
  /** HTML input type (defaults to 'text', overridden to 'text' for currency) */
  type?: string;
  /** Optional aria-label override (defaults to label prop) */
  ariaLabel?: string;
}

/**
 * Formats a raw digit string as Brazilian Real currency (R$ X,XX).
 * Only keeps digits and formats with comma as decimal separator.
 */
function formatCurrency(raw: string): string {
  // Strip non-digit characters
  const digits = raw.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  // Pad with leading zeros to have at least 3 digits (for cents)
  const padded = digits.padStart(3, '0');

  // Split into integer and decimal parts
  const integerPart = padded.slice(0, padded.length - 2);
  const decimalPart = padded.slice(padded.length - 2);

  // Remove leading zeros from integer part, keeping at least one digit
  const trimmedInteger = integerPart.replace(/^0+/, '') || '0';

  return `R$ ${trimmedInteger},${decimalPart}`;
}

/**
 * Extracts only digits from a formatted currency string.
 */
function extractDigits(formatted: string): string {
  return formatted.replace(/\D/g, '');
}

/**
 * Themed Input component for web.
 * Supports label, error state display, and currency mask (R$ X,XX).
 * All visual values come from the ThemeConfig via useTheme().
 */
export function Input({
  label,
  value,
  onChange,
  placeholder,
  error,
  disabled = false,
  mask = 'none',
  type = 'text',
  ariaLabel,
}: InputProps) {
  const theme = useTheme();
  const id = useId();
  const errorId = `${id}-error`;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const rawValue = e.target.value;

    if (mask === 'currency') {
      // Extract only digits and reformat
      const digits = extractDigits(rawValue);
      if (digits.length === 0) {
        onChange('');
        return;
      }
      onChange(formatCurrency(digits));
    } else {
      onChange(rawValue);
    }
  };

  const containerStyle: React.CSSProperties = {
    marginBottom: `${theme.spacing.md}px`,
    display: 'flex',
    flexDirection: 'column',
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.text,
    marginBottom: `${theme.spacing.xs}px`,
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '14px',
    fontWeight: 400,
    color: disabled ? theme.colors.textDisabled : theme.colors.text,
    backgroundColor: disabled ? theme.colors.surfaceDisabled : theme.colors.surface,
    border: error ? `1px solid ${theme.colors.error}` : `1px solid ${theme.colors.border}`,
    borderRadius: '24px',
    paddingTop: '0',
    paddingBottom: '0',
    paddingLeft: '16px',
    paddingRight: '16px',
    height: '48px',
    outline: 'none',
    boxSizing: 'border-box',
    width: '100%',
    cursor: disabled ? 'not-allowed' : 'text',
    transition: 'border-color 0.2s ease, background-color 0.2s ease',
  };

  const errorStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: `${theme.typography.sizes.xs}px`,
    fontWeight: 400,
    color: theme.colors.error,
    marginTop: `${theme.spacing.xs}px`,
  };

  const resolvedInputMode = mask === 'currency' ? 'numeric' : undefined;

  return (
    <div style={containerStyle}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={resolvedInputMode}
        style={inputStyle}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onFocus={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.surface;
          e.currentTarget.style.borderColor = theme.colors.primary;
        }}
        onBlur={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.surface;
          e.currentTarget.style.borderColor = error ? theme.colors.error : theme.colors.border;
        }}
      />
      {error ? (
        <span
          id={errorId}
          role="alert"
          aria-live="polite"
          style={errorStyle}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
