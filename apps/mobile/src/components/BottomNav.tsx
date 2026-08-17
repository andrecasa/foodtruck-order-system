import React from 'react';
import { Pressable, View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { useTheme } from '../theme';

/**
 * BottomNav — standalone bottom navigation bar for screens outside the (tabs) group.
 *
 * Pixel-perfect match to Penpot "Bottom Nav" specs:
 * - height: 56px
 * - backgroundColor: #FFFFFF
 * - shadow: 0 -1px 3px rgba(0,0,0,0.06)
 * - justifyContent: space-around
 * - icon: Material Symbols Outlined 22px
 * - label: 10px, weight 400
 * - active: color #7B2D2D (primary)
 * - inactive: color #8B6B5A (textSecondary)
 */

interface NavItem {
  icon: string;
  label: string;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: 'receipt_long', label: 'Pedidos', route: '/(tabs)' },
  { icon: 'add_circle', label: 'Novo', route: '/(tabs)/new-order' },
  { icon: 'restaurant_menu', label: 'Cardápio', route: '/(tabs)/menu' },
  { icon: 'monitoring', label: 'Resumo', route: '/(tabs)/summary' },
];

export function BottomNav() {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    height: 56 + insets.bottom,
    paddingBottom: insets.bottom,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    boxShadow: '0px -1px 3px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  };

  return (
    <View style={containerStyle} accessibilityRole="tablist">
      {NAV_ITEMS.map((item) => {
        // Determine if this tab is active (loose match)
        const isActive =
          (item.route === '/(tabs)' && pathname === '/') ||
          pathname === item.route ||
          pathname === item.route.replace('/(tabs)', '');

        const color = isActive ? theme.colors.primary : theme.colors.textSecondary;

        const itemStyle: ViewStyle = {
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          flex: 1,
          height: '100%',
        };

        const iconStyle: TextStyle = {
          fontFamily: 'Material Symbols Outlined',
          fontSize: 22,
          fontWeight: '400',
          color,
        };

        const labelStyle: TextStyle = {
          fontFamily: theme.typography.fontFamily,
          fontSize: 10,
          fontWeight: '400',
          color,
        };

        return (
          <Pressable
            key={item.route}
            style={itemStyle}
            onPress={() => router.replace(item.route as never)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
          >
            <RNText style={iconStyle}>{item.icon}</RNText>
            <RNText style={labelStyle}>{item.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
