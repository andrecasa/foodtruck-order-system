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
    { icon: 'monitoring', label: 'Resumo Financeiro', route: '/(tabs)/summary' },
    { icon: 'restaurant_menu', label: 'Cardápio', route: '/(tabs)/menu' },
    ...(user?.role === 'admin'
      ? [
          { icon: 'folder_open', label: 'Categorias', route: '/categories-list' },
          { icon: 'group', label: 'Usuários', route: '/users-list' },
        ]
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
    backgroundColor: theme.colors.background,
    height: '100%',
    paddingTop: insets.top,
  };

  const headerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: theme.colors.surface,
  };

  const closeIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 24,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  const headerTitleStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
    textAlign: 'center',
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
    color: theme.colors.text,
  };

  const dividerStyle: ViewStyle = {
    height: 1,
    backgroundColor: theme.colors.divider,
    marginHorizontal: 24,
    marginVertical: 16,
  };

  const logoutIconStyle: TextStyle = {
    ...menuIconStyle,
  };

  const logoutLabelStyle: TextStyle = {
    ...menuLabelStyle,
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
            <Pressable
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar menu"
              style={{ width: 24, alignItems: 'flex-start' }}
            >
              <RNText style={closeIconStyle}>close</RNText>
            </Pressable>
            <RNText style={headerTitleStyle}>Menu</RNText>
            <View style={{ width: 24 }} />
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
