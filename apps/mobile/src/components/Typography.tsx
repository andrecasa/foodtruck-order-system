import React from 'react';
import { Text as RNText, type StyleProp, type TextStyle } from 'react-native';
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
  style?: StyleProp<TextStyle>;
}

export interface HeadingProps {
  children: React.ReactNode;
  level?: HeadingLevel;
  color?: string;
  align?: TextAlign;
  style?: StyleProp<TextStyle>;
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
  style,
}: TextProps) {
  const theme = useTheme();

  const textStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes[size],
    fontWeight: String(theme.typography.weights[weight]) as TextStyle['fontWeight'],
    color: color ?? theme.colors.text,
    textAlign: align,
  };

  return (
    <RNText style={[textStyle, style]}>
      {children}
    </RNText>
  );
}

/**
 * Heading component that maps levels to theme size/weight tokens.
 *
 * Level mapping:
 *   1 → size xxl, weight bold
 *   2 → size xl, weight bold
 *   3 → size lg, weight medium
 *   4 → size md, weight medium
 *
 * Uses accessibilityRole="header" for assistive technologies on React Native.
 */
export function Heading({
  children,
  level = 1,
  color,
  align,
  style,
}: HeadingProps) {
  const theme = useTheme();

  const levelConfig = {
    1: { size: theme.typography.sizes.xxl, weight: theme.typography.weights.bold },
    2: { size: theme.typography.sizes.xl, weight: theme.typography.weights.bold },
    3: { size: theme.typography.sizes.lg, weight: theme.typography.weights.medium },
    4: { size: theme.typography.sizes.md, weight: theme.typography.weights.medium },
  } as const;

  const config = levelConfig[level];

  const headingStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: config.size,
    fontWeight: String(config.weight) as TextStyle['fontWeight'],
    color: color ?? theme.colors.text,
    textAlign: align,
  };

  return (
    <RNText
      style={[headingStyle, style]}
      accessibilityRole="header"
    >
      {children}
    </RNText>
  );
}
