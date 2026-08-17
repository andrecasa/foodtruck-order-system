import React from 'react';
import {
  Platform,
  Pressable,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

export type CardVariant = 'default' | 'aguardando' | 'preparando' | 'pronto';

export interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Accessible label for interactive cards */
  accessibilityLabel?: string;
  /** Accessibility hint describing the action */
  accessibilityHint?: string;
}

/**
 * Card container component for displaying orders in the queue.
 * Pixel-perfect match to Penpot Design System.
 *
 * Penpot specs:
 * - background: gradient (white → 10% status color diagonal) + white base
 * - border-radius: 12px
 * - border: 1px solid <status-color> at 30% opacity (inner)
 * - padding: 16px
 * - gap: 12px (flex column)
 * - shadow (elevated/default): 0 2px 8px rgba(0,0,0,0.08)
 */
export function Card({ children, variant = 'default', onPress, style, accessibilityLabel, accessibilityHint }: CardProps) {
  const theme = useTheme();

  const getStatusColor = (): string | null => {
    switch (variant) {
      case 'aguardando': return theme.colors.aguardando;
      case 'preparando': return theme.colors.preparando;
      case 'pronto': return theme.colors.pronto;
      default: return null;
    }
  };

  const statusColor = getStatusColor();

  const baseStyle: ViewStyle = {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: statusColor ? statusColor + '4D' : theme.colors.divider, // 30% opacity
    gap: 12,
    overflow: 'hidden',
  };

  const shadowStyle: ViewStyle = !statusColor ? {
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  } : {};

  const combinedStyle: ViewStyle = {
    ...baseStyle,
    ...shadowStyle,
  };

  const content = (
    <>
      {/* Gradient overlay for status cards */}
      {statusColor && (
        <LinearGradient
          colors={['transparent', statusColor + '1A']} // transparent → 10% status
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: 11, // slightly less than container to stay inside border
          }}
        />
      )}
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={[{ backgroundColor: theme.colors.surface }, combinedStyle, style]}
        // On web, avoid accessibilityRole="button" to prevent nested <button> DOM violation
        // when Card contains interactive children (Button, TouchableOpacity).
        // On native, keep "button" for proper screen reader announcement.
        accessibilityRole={Platform.OS === 'web' ? undefined : 'button'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        // Web: add aria-label directly for assistive tech
        {...(Platform.OS === 'web' ? { 'aria-label': accessibilityLabel } : {})}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[{ backgroundColor: theme.colors.surface }, combinedStyle, style]}>
      {content}
    </View>
  );
}
