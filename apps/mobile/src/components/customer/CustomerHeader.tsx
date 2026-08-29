import React from 'react';
import { View, Text, Pressable, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from '../../theme';

export interface CustomerHeaderProps {
  /** Title displayed centered in the app bar. */
  title: string;
  /** If provided, shows a back arrow on the left and calls this on press. */
  onBack?: () => void;
}

/**
 * App bar for the public (customer) flow.
 *
 * Matches the operator's `Header` (see components/Layout.tsx) so both contexts
 * share one visual language: same surface background, 56px height, 16px
 * horizontal padding, and a centered title at 18px / weight 400 in the theme
 * font and text color.
 *
 * The customer flow has no authentication, so this app bar deliberately omits
 * the hamburger menu / DrawerMenu that the operator header carries. When
 * `onBack` is given, a back arrow appears on the left; a matching invisible
 * spacer on the right keeps the title optically centered (same trick the
 * operator header uses).
 */
export function CustomerHeader({ title, onBack }: CustomerHeaderProps) {
  const theme = useTheme();

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
    backgroundColor: theme.colors.surface,
  };

  const iconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  const titleStyle: TextStyle = {
    fontSize: 18,
    fontWeight: '400',
    fontFamily: theme.typography.fontFamily,
    color: theme.colors.text,
    flex: 1,
    textAlign: 'center',
  };

  return (
    <View style={containerStyle} accessibilityRole="header">
      {onBack ? (
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Voltar">
          <Text style={iconStyle}>arrow_back</Text>
        </Pressable>
      ) : (
        /* Left spacer keeps the title centered when there is no back button. */
        <View style={{ width: 24 }} />
      )}

      <Text style={titleStyle} numberOfLines={1}>
        {title}
      </Text>

      {/* Right spacer mirrors the left icon width for symmetric centering. */}
      <View style={{ width: 24 }} />
    </View>
  );
}
