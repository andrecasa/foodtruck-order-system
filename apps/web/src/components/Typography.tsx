import React from 'react';
import { useTheme } from '../theme';

export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type TextWeight = 'regular' | 'medium' | 'bold';
export type TextAlign = 'left' | 'center' | 'right';
export type HeadingLevel = 1 | 2 | 3 | 4;

export interface TextProps {
  children: React.ReactNode;
  size?: TextSize;
  weight?: TextWeight;
  color?: string;
  align?: TextAlign;
  className?: string;
}

export interface HeadingProps {
  children: React.ReactNode;
  level?: HeadingLevel;
  color?: string;
  align?: TextAlign;
  className?: string;
}

/**
 * Text component that uses theme tokens for all typography values.
 * No hardcoded visual values — font size, weight, family, and color
 * all come from ThemeConfig via useTheme().
 */
export function Text({
  children,
  size = 'md',
  weight = 'regular',
  color,
  align,
  className,
}: TextProps) {
  const theme = useTheme();

  const style: React.CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    fontSize: `${theme.typography.sizes[size]}px`,
    fontWeight: theme.typography.weights[weight],
    color: color ?? theme.colors.text,
    textAlign: align,
  };

  return (
    <span style={style} className={className}>
      {children}
    </span>
  );
}

/**
 * Heading component that maps levels to theme size/weight tokens and renders
 * the appropriate semantic HTML heading tag (h1–h4).
 *
 * Level mapping:
 *   1 → size xxl, weight bold → <h1>
 *   2 → size xl, weight bold → <h2>
 *   3 → size lg, weight medium → <h3>
 *   4 → size md, weight medium → <h4>
 */
export function Heading({
  children,
  level = 1,
  color,
  align,
  className,
}: HeadingProps) {
  const theme = useTheme();

  const levelConfig = {
    1: { size: theme.typography.sizes.xxl, weight: theme.typography.weights.bold },
    2: { size: theme.typography.sizes.xl, weight: theme.typography.weights.bold },
    3: { size: theme.typography.sizes.lg, weight: theme.typography.weights.medium },
    4: { size: theme.typography.sizes.md, weight: theme.typography.weights.medium },
  } as const;

  const config = levelConfig[level];

  const style: React.CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    fontSize: `${config.size}px`,
    fontWeight: config.weight,
    color: color ?? theme.colors.text,
    textAlign: align,
    margin: 0,
  };

  const Tag = `h${level}` as const;

  return (
    <Tag style={style} className={className}>
      {children}
    </Tag>
  );
}
