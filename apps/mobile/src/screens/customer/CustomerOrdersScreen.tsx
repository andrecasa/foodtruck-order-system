import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Image, ScrollView, View, Text as RNText, type ImageStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../theme';
import { Button } from '../../components';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { CustomerBottomNav } from '../../components/customer/CustomerBottomNav';
import { CustomerOrderCard } from '../../components/customer/CustomerOrderCard';
import { ordersHref, qrcodeHref, menuHref } from '../../components/customer/customerNavHref';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';
import { usePublicBranding } from '../../hooks/customer/usePublicBranding';
import { usePublicOrdersTracking } from '../../hooks/customer/usePublicOrdersTracking';

export interface CustomerOrdersScreenProps {
  /** Tenant slug from the route (`/:slug/orders`). */
  slug: string;
}

/**
 * "Meus Pedidos" (`/:slug/orders`) — the unified customer orders screen.
 *
 * Lists every order the customer placed in THIS session (from
 * `useSessionOrders`), displayed oldest → newest, as a FULL tracking card
 * (`CustomerOrderCard`): payment + status badges, "#N - Name", the item lines,
 * the total, and a "Pedido criado há X" footer. This unifies what used to be a
 * lightweight list + a separate tracking screen into one screen, mirroring the
 * operator OrderQueueScreen (a scrollable list of order cards).
 *
 * Each card's live data comes from `usePublicOrdersTracking` (fetch by id +
 * realtime status/payment updates with a polling fallback). A focus refresh
 * re-reads the persisted session list when returning to the screen.
 */
export function CustomerOrdersScreen({ slug }: CustomerOrdersScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { orders, refresh } = useSessionOrders(slug);
  const { realtimeChannel, branding } = usePublicBranding(slug);

  // Re-read the persisted list whenever the screen regains focus (an order may
  // have been placed on another screen while this one stayed mounted).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const orderIds = useMemo(() => orders.map((o) => o.id), [orders]);
  const { ordersById, isLoading } = usePublicOrdersTracking(slug, orderIds, realtimeChannel);

  // `useSessionOrders` stores orders oldest-first (placement order), so the
  // list is rendered directly in that order.

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const contentStyle: ViewStyle = {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  };

  // Top-aligned like the QrCode screen so the tenant logo lands in the same
  // spot (just below the header) instead of vertically centered.
  const emptyContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  };

  // Tenant logo above the empty-state illustration — same pattern/size as the
  // QrCode screen, so the empty Pedidos screen stays on-brand. Extra bottom
  // margin adds breathing room before the illustration.
  const logoStyle: ImageStyle = {
    width: 125,
    height: 125,
    marginBottom: theme.spacing.lg,
  };

  const isEmpty = orders.length === 0;

  if (isEmpty) {
    return (
      <SafeAreaView style={safeAreaStyle} edges={['top', 'bottom', 'left', 'right']}>
        <CustomerHeader title={branding?.businessName ?? 'Pedidos'} />
          <View style={emptyContainerStyle}>
            {/* Illustrated empty state */}
            <View style={{ alignItems: 'center', gap: 12 }}>
              {/* Tenant logo — same pattern as the QrCode screen, above the illustration. */}
              {theme.logo ? (
                <Image
                  source={{ uri: theme.logo }}
                  style={logoStyle}
                  resizeMode="contain"
                  accessibilityLabel={`Logo ${branding?.businessName ?? ''}`.trim()}
                  testID="orders-empty-logo"
                />
              ) : null}
              <View style={{
                width: 120,
                height: 150,
                borderRadius: 12,
                backgroundColor: theme.colors.primary + '14',
                borderWidth: 1.5,
                borderColor: theme.colors.primary + '4D',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <View style={{
                  width: 100,
                  height: 130,
                  borderRadius: 8,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                }}>
                  <View style={{ width: 60, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.textSecondary, opacity: 0.2 }} />
                  <View style={{ width: 50, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.textSecondary, opacity: 0.15 }} />
                  <View style={{ width: 35, height: 5, borderRadius: 2.5, backgroundColor: theme.colors.textSecondary, opacity: 0.1 }} />
                </View>
              </View>
              <View style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: theme.colors.primary + '1F',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: -30,
              }}>
                <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 24, color: theme.colors.primary, opacity: 0.6 }}>receipt_long</RNText>
              </View>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 13, fontWeight: '500', color: theme.colors.textSecondary, opacity: 0.8 }}>
                Você não tem nenhum pedido
              </RNText>
              <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 11, fontWeight: '400', color: theme.colors.textSecondary, opacity: 0.5 }}>
                Os novos pedidos aparecerão aqui
              </RNText>
              <View style={{ marginTop: theme.spacing.lg }}>
                <Button
                  title="Novo Pedido"
                  variant="primary"
                          onPress={() => router.replace(menuHref(slug))}
                />
              </View>            
            </View>
          </View>
        <CustomerBottomNav slug={slug} active="pedidos" qrcodeHref={qrcodeHref(slug)} pedidosHref={ordersHref(slug)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'bottom', 'left', 'right']}>
      <CustomerHeader title={branding?.businessName ?? 'Pedidos'} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={contentStyle}
        showsVerticalScrollIndicator
      >
        
        {/* Show a spinner only on the very first load, before any card resolves. */}
        {isLoading && Object.keys(ordersById).length === 0 ? (
          <View style={{ paddingVertical: theme.spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : null}

        <View style={{ gap: theme.spacing.md }} testID="my-orders-section">
          {orders.map((sessionOrder) => {
            const full = ordersById[sessionOrder.id];
            if (!full) return null; // still loading / failed — skip until available
            return (
              <CustomerOrderCard
                key={sessionOrder.id}
                order={full}
                testID={`order-card-${sessionOrder.id}`}
              />
            );
          })}
        </View>
      </ScrollView>

      <CustomerBottomNav slug={slug} active="pedidos" qrcodeHref={qrcodeHref(slug)} pedidosHref={ordersHref(slug)} />
    </SafeAreaView>
  );
}
