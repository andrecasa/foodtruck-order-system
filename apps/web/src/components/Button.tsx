import React from 'react';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  /** Custom background color override (e.g. for status-colored buttons) */
  color?: string;
}

/**
 * Button component — pixel-perfect match to Penpot Design System.
 *
 * Penpot specs (all variants):
 * - border-radius: 20px
 * - height: 40px
 * - padding: 0 20px
 * - font: Inter 14px weight 400
 *
 * Filled: bg varies by variant, text #FFFFFF
 * Outlined: bg transparent, stroke 1px solid #8B6B5A inner, text #8B6B5A
 * Disabled: bg #E8DDD5, text #9E9E9E, no stroke
 */
export function Button({
  children,
  variant = 'primary',
  onClick,
  disabled = false,
  loading = false,
  type = 'button',
  ariaLabel,
  color,
}: ButtonProps) {
  const theme = useTheme();

  const getBackgroundColor = (): string => {
    if (disabled) return '#E8DDD5';
    if (color) return color;
    switch (variant) {
      case 'primary': return theme.colors.primary;
      case 'secondary': return theme.colors.secondary;
      case 'outline': return 'transparent';
      case 'danger': return theme.colors.error;
    }
  };

  const getTextColor = (): string => {
    if (disabled) return '#9E9E9E';
    switch (variant) {
      case 'outline': return color ? color : '#8B6B5A';
      default: return '#FFFFFF';
    }
  };

  const style: React.CSSProperties = {
    backgroundColor: getBackgroundColor(),
    color: getTextColor(),
    border: variant === 'outline' ? `1px solid ${disabled ? 'transparent' : (color || '#8B6B5A')}` : 'none',
    borderRadius: '20px',
    height: '40px',
    padding: '0 20px',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: '14px',
    fontWeight: 400,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    transition: 'opacity 0.15s ease',
    opacity: loading ? 0.7 : 1,
    whiteSpace: 'nowrap',
  };

  return (
    <button
      type={type}
      style={style}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      aria-busy={loading}
    >
      {loading ? (
        <span style={{
          display: 'inline-block',
          width: '14px',
          height: '14px',
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'button-spin 0.6s linear infinite',
        }} />
      ) : children}
    </button>
  );
}
