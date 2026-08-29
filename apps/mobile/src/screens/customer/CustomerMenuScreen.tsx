import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import type { PublicMenuItem } from '@order-system/shared';
import { useTheme } from '../../theme';
import { Button, Heading, Text } from '../../components';
import { formatPrice } from '../../utils/format';
import { usePublicMenu } from '../../hooks/customer/usePublicMenu';
import { useCart } from '../../hooks/customer/useCart';
import { CategorySection } from '../../components/customer/CategorySection';
import { CartSheet } from '../../components/customer/CartSheet';
import { CustomerHeader } from '../../components/customer/CustomerHeader';
import { useSessionOrders } from '../../hooks/customer/useSessionOrders';

export interface CustomerMenuScreenProps {
  /** Tenant slug from the route (`/:slug`). */
  slug: string;
  /** Business name resolved from branding, shown at the top. */
  businessName?: string;
}

/**
 * Public customer menu screen (`/:slug`).
 *
 * Fetches the tenant's public menu, renders each category with its items, and
 * shows a fixed bottom bar summarizing the cart (item count + total). Tapping
 * the bar opens the cart bottom sheet (`CartSheet`), from which the customer can
 * adjust quantities, remove items and proceed to checkout.
 */
export function CustomerMenuScreen({ slug, businessName }: CustomerMenuScreenProps) {
  const theme = useTheme();
  const router = useRouter();
  const { categories, isLoading, error, refetch } = usePublicMenu(slug);
  const cart = useCart(slug);
  const { orders: sessionOrders, refresh: refreshSessionOrders } = useSessionOrders(slug);
  const [cartOpen, setCartOpen] = useState(false);

  // The cardápio can stay mounted while the customer places orders elsewhere,
  // so re-read the persisted session orders whenever this screen regains focus
  // (e.g. after returning from checkout/tracking).
  useFocusEffect(
    useCallback(() => {
      refreshSessionOrders();
    }, [refreshSessionOrders]),
  );

  const handleOpenOrder = (orderId: string) => {
    router.push(
      `/${encodeURIComponent(slug)}/pedido/${encodeURIComponent(orderId)}`,
    );
  };

  const handleAddItem = (item: PublicMenuItem) => {
    cart.addItem(item, 1);
  };

  const handleCheckout = () => {
    setCartOpen(false);
    router.push(`/${encodeURIComponent(slug)}/checkout`);
  };

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const centeredStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  };

  const scrollContentStyle: ViewStyle = {
    padding: theme.spacing.md,
    // leave room for the fixed bottom bar (xl spacing token × 3)
    paddingBottom: theme.spacing.xl * 3,
  };

  const bottomBarStyle: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  };

  const bottomBarLeftStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  };

  const cartIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: theme.typography.sizes.xl,
    color: theme.colors.surface,
  };

  const countBadgeStyle: ViewStyle = {
    minWidth: theme.spacing.lg,
    height: theme.spacing.lg,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const countTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.xs,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.primary,
  };

  const bottomBarTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    fontWeight: String(theme.typography.weights.medium) as TextStyle['fontWeight'],
    color: theme.colors.surface,
  };

  const bottomBarTotalStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    fontWeight: String(theme.typography.weights.bold) as TextStyle['fontWeight'],
    color: theme.colors.surface,
  };

  // ─── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={safeAreaStyle}>
        <View style={centeredStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <View style={{ marginTop: theme.spacing.sm }}>
            <Text color={theme.colors.textSecondary}>Carregando cardápio...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={safeAreaStyle}>
        <View style={centeredStyle} testID="menu-error">
          <Text align="center" color={theme.colors.error}>
            {error.message}
          </Text>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button title="Tentar novamente" variant="primary" onPress={refetch} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const isEmptyMenu = categories.length === 0;

  return (
    <SafeAreaView style={safeAreaStyle} edges={['top', 'left', 'right']}>
      <CustomerHeader title={businessName ?? 'Cardápio'} />

      {/* "Meus pedidos" — orders placed this session (session-scoped). */}
      {sessionOrders.length > 0 ? (
        <View
          style={{
            marginHorizontal: theme.spacing.md,
            marginTop: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
          testID="my-orders-section"
        >
          {sessionOrders.map((o) => (
            <Pressable
              key={o.id}
              onPress={() => handleOpenOrder(o.id)}
              accessibilityRole="button"
              accessibilityLabel={`Pedido número ${o.dailyNumber}, ${o.customerName}`}
              testID={`track-order-${o.id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.borderRadius.md,
                backgroundColor: theme.colors.primary + '1F',
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}
              >
                <RNText
                  style={{
                    fontFamily: 'Material Symbols Outlined',
                    fontSize: theme.typography.sizes.xl,
                    color: theme.colors.primary,
                  }}
                >
                  receipt_long
                </RNText>
                <Text weight="medium" color={theme.colors.primary}>
                  Pedido #{o.dailyNumber} - {o.customerName}
                </Text>
              </View>
              <RNText
                style={{
                  fontFamily: 'Material Symbols Outlined',
                  fontSize: theme.typography.sizes.xl,
                  color: theme.colors.primary,
                }}
              >
                chevron_right
              </RNText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={scrollContentStyle} showsVerticalScrollIndicator>
        {isEmptyMenu ? (
          <View style={{ paddingVertical: theme.spacing.lg * 2, alignItems: 'center' }}>
            <Text color={theme.colors.textSecondary}>
              Nenhum item disponível no momento.
            </Text>
          </View>
        ) : (
          categories.map((category) => (
            <CategorySection
              key={`${category.name}-${category.sortOrder}`}
              category={category}
              onAddItem={handleAddItem}
            />
          ))
        )}
      </ScrollView>

      {/* Cart bar is ALWAYS visible at the bottom. When empty it shows a zeroed
          total and is not tappable (opening an empty cart adds no value). */}
      <Pressable
        style={bottomBarStyle}
        onPress={cart.count > 0 ? () => setCartOpen(true) : undefined}
        disabled={cart.count === 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: cart.count === 0 }}
        accessibilityLabel={
          cart.count > 0
            ? `Abrir carrinho, ${cart.count} ${
                cart.count === 1 ? 'item' : 'itens'
              }, total ${formatPrice(cart.total)}`
            : 'Carrinho vazio'
        }
        testID="cart-bar"
      >
        <View style={bottomBarLeftStyle}>
          <RNText style={cartIconStyle}>shopping_cart</RNText>
          <View style={countBadgeStyle}>
            <RNText style={countTextStyle}>{cart.count}</RNText>
          </View>
          <RNText style={bottomBarTextStyle}>Ver carrinho</RNText>
        </View>
        <RNText style={bottomBarTotalStyle}>{formatPrice(cart.total)}</RNText>
      </Pressable>

      <CartSheet
        visible={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cart.items}
        total={cart.total}
        onIncrement={(id) => {
          const line = cart.items.find((i) => i.menuItemId === id);
          if (line) cart.updateQuantity(id, line.quantity + 1);
        }}
        onDecrement={(id) => {
          const line = cart.items.find((i) => i.menuItemId === id);
          if (line) cart.updateQuantity(id, line.quantity - 1);
        }}
        onRemove={cart.removeItem}
        onCheckout={handleCheckout}
      />
    </SafeAreaView>
  );
}
