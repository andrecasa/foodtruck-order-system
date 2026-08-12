import React from 'react';
import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * Material Symbols Outlined icon component using the icon font.
 * Penpot spec: 22px, weight 400, Material Symbols Outlined font.
 */
function TabIcon({ name, color }: { name: string; color: string }) {
  return (
    <Text
      style={{
        fontFamily: 'Material Symbols Outlined',
        fontSize: 22,
        fontWeight: '400',
        color,
      }}
    >
      {name}
    </Text>
  );
}

/**
 * Tab layout — bottom tab navigator pixel-perfect to Penpot.
 *
 * Penpot Bottom Nav specs:
 * - bg: #FFFFFF
 * - shadow: 0 -1px 3px rgba(0,0,0,0.06)
 * - height: 56px
 * - justify-content: space-around
 * - Active: icon + label in primary (#7B2D2D), weight 400
 * - Inactive: icon + label in #8B6B5A (textSecondary), weight 400
 * - Icon: Material Symbols Outlined 22px
 * - Label: 10px Inter
 */
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: '#8B6B5A',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          height: 56,
          borderTopWidth: 0,
          elevation: 0,
          boxShadow: '0px -1px 3px rgba(0, 0, 0, 0.06)',
        },
        tabBarLabelStyle: {
          fontFamily: theme.typography.fontFamily,
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color }) => <TabIcon name="receipt_long" color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-order"
        options={{
          title: 'Novo',
          tabBarIcon: ({ color }) => <TabIcon name="add_circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Cardápio',
          tabBarIcon: ({ color }) => <TabIcon name="restaurant_menu" color={color} />,
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Resumo',
          tabBarIcon: ({ color }) => <TabIcon name="bar_chart" color={color} />,
        }}
      />
    </Tabs>
  );
}
