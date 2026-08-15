import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../theme';
import { useAuth } from '../hooks/useAuth';

/**
 * Drawer menu item definition.
 */
interface DrawerMenuItem {
  icon: string;
  label: string;
  route?: string;
  onPress?: () => void;
  color?: string;
}

export interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82; // ~82% screen width (Material Design standard)

/**
 * Drawer Menu — pixel-perfect match to Penpot "Drawer Menu" design.
 * Animates from left to right (Material Design standard).
 *
 * Penpot specs:
 * - Background: #F5F0EB
 * - Header: 56px, bg #FFFFFF, shadow 0 1px 3px rgba(0,0,0,0.06)
 *   - Close icon: Material Symbols "close" 24px, color #8B6B5A
 *   - Title: "Menu" Inter 18px weight 500, color #3D2020, centered
 * - Menu items: height 52px, padding horizontal 24px, gap 16px
 *   - Icon: Material Symbols 22px, color #7B2D2D (primary)
 *   - Label: Inter 16px weight 400, color #3D2020
 * - Divider: 1px #E0D6CC, margin horizontal 24px, vertical 16px
 * - Sair: icon + label color #D32F2F
 */
export function DrawerMenu({ visible, onClose }: DrawerMenuProps) {
  const theme = useTheme();
  const router = useRouter();
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, overlayAnim]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -DRAWER_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  };

  const menuItems: DrawerMenuItem[] = [
    { icon: 'receipt_long', label: 'Pedidos', route: '/(tabs)' },
    { icon: 'add_circle', label: 'Novo Pedido', route: '/(tabs)/new-order' },
    { icon: 'restaurant_menu', label: 'Cardápio', route: '/(tabs)/menu' },
    { icon: 'monitoring', label: 'Resumo Financeiro', route: '/(tabs)/summary' },
    ...(user?.role === 'admin'
      ? [{ icon: 'group', label: 'Usuários', route: '/users-list' }]
      : []),
  ];

  const handleNavigate = (item: DrawerMenuItem) => {
    handleClose();
    setTimeout(() => {
      if (item.route) {
        router.push(item.route as never);
      } else if (item.onPress) {
        item.onPress();
      }
    }, 220);
  };

  const handleLogout = async () => {
    handleClose();
    await logout();
    setTimeout(() => {
      router.replace('/login' as never);
    }, 220);
  };

  // ─── Styles ───────────────────────────────────────────────────────────────

  const modalContainerStyle: ViewStyle = {
    flex: 1,
    flexDirection: 'row',
  };

  const drawerStyle: ViewStyle = {
    width: DRAWER_WIDTH,
    backgroundColor: '#F5F0EB',
    height: '100%',
    paddingTop: insets.top,
  };

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.06)',
    elevation: 2,
  };

  const closeIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    fontWeight: '400',
    color: '#8B6B5A',
  };

  const headerTitleStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '500',
    color: '#3D2020',
    textAlign: 'center',
  };

  const spacerStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    fontWeight: '400',
    color: 'transparent',
  };

  const menuListStyle: ViewStyle = {
    flex: 1,
    paddingTop: 16,
  };

  const menuItemStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 24,
    gap: 16,
  };

  const menuIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    fontWeight: '400',
    color: theme.colors.primary,
  };

  const menuLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 16,
    fontWeight: '400',
    color: '#3D2020',
  };

  const dividerStyle: ViewStyle = {
    height: 1,
    backgroundColor: '#E0D6CC',
    marginHorizontal: 24,
    marginVertical: 16,
  };

  const logoutIconStyle: TextStyle = {
    ...menuIconStyle,
    color: '#D32F2F',
  };

  const logoutLabelStyle: TextStyle = {
    ...menuLabelStyle,
    color: '#D32F2F',
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={modalContainerStyle}>
        {/* Overlay (tap to close) */}
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            opacity: overlayAnim,
          }}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Fechar menu"
          />
        </Animated.View>

        {/* Drawer panel (slides from left) */}
        <Animated.View
          style={[drawerStyle, { transform: [{ translateX: slideAnim }] }]}
        >
          {/* Header */}
          <View style={headerStyle}>
            <Pressable onPress={handleClose} accessibilityRole="button" accessibilityLabel="Fechar menu">
              <RNText style={closeIconStyle}>close</RNText>
            </Pressable>
            <RNText style={headerTitleStyle}>Menu</RNText>
            <RNText style={spacerStyle}>close</RNText>
          </View>

          {/* Menu Items */}
          <View style={menuListStyle}>
            {menuItems.map((item) => (
              <Pressable
                key={item.label}
                style={menuItemStyle}
                onPress={() => handleNavigate(item)}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
              >
                <RNText style={menuIconStyle}>{item.icon}</RNText>
                <RNText style={menuLabelStyle}>{item.label}</RNText>
              </Pressable>
            ))}

            {/* Divider */}
            <View style={dividerStyle} />

            {/* Sair */}
            <Pressable
              style={menuItemStyle}
              onPress={handleLogout}
              accessibilityRole="menuitem"
              accessibilityLabel="Sair"
            >
              <RNText style={logoutIconStyle}>logout</RNText>
              <RNText style={logoutLabelStyle}>Sair</RNText>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
