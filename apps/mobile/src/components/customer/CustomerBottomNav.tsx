import React from 'react';
import { Pressable, View, Text as RNText, type ViewStyle, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { qrcodeHref, menuHref, ordersHref } from './customerNavHref';

/**
 * CustomerBottomNav — bottom navigation bar for the public (customer) flow.
 *
 * Mirrors the operator `BottomNav` (see components/BottomNav.tsx) so both
 * contexts share one visual language, matching Penpot "Clientes" boards.
 * Order (left → right): Pedidos | Novo | QrCode.
 * - Pedidos (`receipt_long`) → the session orders list (`/:slug/orders`)
 * - Novo (`add_circle`)      → the tenant menu / new order screen (`/:slug/new-order`)
 * - QrCode (`qr_code`)       → the tenant landing page (`/:slug/qrcode`)
 *
 * Penpot specs (Clientes Bottom Nav):
 * - bar: height 56px, backgroundColor #FFFFFF (surface), justifyContent space-around
 * - item: 80×48, column, gap 2, centered
 * - icon: Material Symbols Outlined 22px / weight 400
 * - label: 10px / weight 400
 * - active: primary; inactive: textSecondary
 *
 * The customer flow has no authentication, so — like `CustomerHeader` — this
 * omits any operator-only affordances (drawer, logout).
 */

/** Which tab is currently active. Drives the active color per item. */
export type CustomerNavTab = 'qrcode' | 'novo' | 'pedidos';

export interface CustomerBottomNavProps {
  /** Tenant slug, used to build the route targets. */
  slug: string;
  /** Currently active tab (for highlighting). */
  active: CustomerNavTab;
  /**
   * Where "QrCode" should navigate. Screens pass the qrcode route
   * (`/:slug/qrcode`). When omitted, "QrCode" falls back to `qrcodeHref(slug)`.
   */
  qrcodeHref?: string;
  /**
   * Where "Pedidos" should navigate. Screens pass the session orders-list route
   * (`/:slug/orders`, via `ordersHref`). When omitted, "Pedidos" falls back to
   * the session orders list.
   */
  pedidosHref?: string;
}

interface NavItem {
  key: CustomerNavTab;
  icon: string;
  label: string;
  href: string;
}

export function CustomerBottomNav({ slug, active, qrcodeHref: qrcodeHrefProp, pedidosHref }: CustomerBottomNavProps) {
  const theme = useTheme();
  const router = useRouter();

  // Order (left → right): Pedidos | Novo | QrCode.
  const items: NavItem[] = [
    { key: 'pedidos', icon: 'receipt_long', label: 'Pedidos', href: pedidosHref ?? ordersHref(slug) },
    { key: 'novo', icon: 'add_circle', label: 'Novo', href: menuHref(slug) },
    { key: 'qrcode', icon: 'qr_code', label: 'QrCode', href: qrcodeHrefProp ?? qrcodeHref(slug) },
  ];

  const containerStyle: ViewStyle = {
    height: 56,
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  };

  return (
    <View style={containerStyle} accessibilityRole="tablist">
      {items.map((item) => {
        const isActive = item.key === active;
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
            key={item.key}
            style={itemStyle}
            onPress={() => router.replace(item.href as never)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
            testID={`customer-nav-${item.key}`}
          >
            <RNText style={iconStyle}>{item.icon}</RNText>
            <RNText style={labelStyle}>{item.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
