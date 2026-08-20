import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { DrawerMenu } from './DrawerMenu';
import { ConnectionBanner } from './ConnectionBanner';
import { OfflineIllustration } from './OfflineIllustration';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

// ─── Screen ─────────────────────────────────────────────────────────────────

export interface ScreenProps {
  children: React.ReactNode;
  /** Applies horizontal/vertical padding using theme.spacing.md. Defaults to true. */
  padding?: boolean;
}

/**
 * Full-screen container wrapping content in a SafeAreaView.
 * Uses theme.colors.background and optional padding from theme tokens.
 * When offline, shows ConnectionBanner + OfflineIllustration in the content area.
 * Header and navigation remain visible.
 */
export function Screen({ children, padding = true }: ScreenProps) {
  const theme = useTheme();
  const { isOffline } = useNetworkStatus();

  const safeAreaStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
  };

  const innerStyle: ViewStyle = {
    flex: 1,
    ...(padding && { padding: theme.spacing.md }),
  };

  if (isOffline) {
    // When offline: render children (Header etc.) but overlay with illustration
    // We use React.Children to extract the first child (Header) and replace the rest
    const childArray = React.Children.toArray(children);
    // Keep first child (typically Header) and replace the rest with illustration
    const header = childArray.length > 0 ? childArray[0] : null;

    return (
      <SafeAreaView style={safeAreaStyle}>
        <ConnectionBanner />
        <View style={innerStyle}>
          {header}
          <OfflineIllustration />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={safeAreaStyle}>
      <View style={innerStyle}>
        {children}
      </View>
    </SafeAreaView>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────

export interface HeaderProps {
  children?: React.ReactNode;
  /** Optional title displayed centered in the header. */
  title?: string;
  /** Optional Material Symbols Outlined icon name (deprecated — no longer shown per Penpot update). */
  icon?: string;
  /** Optional element rendered on the right side of the header. */
  rightElement?: React.ReactNode;
  /** Whether to show the hamburger menu button. Defaults to true. */
  showMenu?: boolean;
  /** If provided, shows a back arrow instead of the menu icon and calls this on press. */
  onBack?: () => void;
}

/**
 * Top bar / page header with hamburger menu (left) and centered title.
 * Logout action lives only in the Drawer Menu.
 *
 * Pixel-perfect match to Penpot AppBar:
 * - bg: #FFFFFF
 * - shadow: 0 1px 3px rgba(0,0,0,0.06)
 * - height: 56px
 * - padding: 0 16px
 * - gap: 12px, align-items: center, justify-content: flex-start
 * - Elements (left → right):
 *   - Menu icon: Material Symbols "menu" 24px, color #8B6B5A (textSecondary)
 *   - Title: 18px weight 400 Inter, color #3D2020 (text), flex:1, textAlign: center
 */
export function Header({ children, title, icon: _icon, rightElement, showMenu = true, onBack }: HeaderProps) {
  const theme = useTheme();
  const [drawerVisible, setDrawerVisible] = useState(false);

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 16,
    height: 56,
    gap: 12,
    backgroundColor: theme.colors.surface,
  };

  const menuIconStyle: TextStyle = {
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
    <>
      <View style={containerStyle} accessibilityRole="header">
        {title ? (
          <>
            {onBack ? (
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel="Voltar"
              >
                <Text style={menuIconStyle}>arrow_back</Text>
              </Pressable>
            ) : showMenu ? (
              <Pressable
                onPress={() => setDrawerVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="Abrir menu"
              >
                <Text style={menuIconStyle}>menu</Text>
              </Pressable>
            ) : null}
            <Text style={titleStyle}>{title}</Text>
            {rightElement ? (
              <View>{rightElement}</View>
            ) : (
              /* Spacer: invisible element matching menu icon width for symmetric centering */
              <View style={{ width: 24 }} />
            )}
          </>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>{children}</View>
        )}
      </View>
      <DrawerMenu visible={drawerVisible} onClose={() => setDrawerVisible(false)} />
    </>
  );
}

// ─── ScrollContainer ────────────────────────────────────────────────────────

export interface ScrollContainerProps {
  children: React.ReactNode;
  /** Applies padding using theme.spacing.md. Defaults to true. */
  padding?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * When true, the ScrollView fills available vertical space (flex: 1),
   * so sibling elements like a fixed BottomNav stay pinned at the bottom
   * and the content between scrolls. Defaults to false for backward compatibility.
   */
  fillHeight?: boolean;
}

/**
 * Scrollable content area using ScrollView with theme-based spacing.
 */
export function ScrollContainer({ children, padding = true, style, fillHeight = false }: ScrollContainerProps) {
  const theme = useTheme();

  return (
    <ScrollView
      style={fillHeight ? { flex: 1 } : undefined}
      contentContainerStyle={[
        padding && { padding: theme.spacing.md },
        style,
      ]}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

// ─── Grid ───────────────────────────────────────────────────────────────────

export interface GridProps {
  children: React.ReactNode;
  /** Number of columns. Defaults to 2. */
  columns?: number;
  /** Gap between items. Uses theme.spacing.md if not specified. */
  gap?: number;
}

/**
 * Simple flex-based grid layout using flexDirection:'row' and flexWrap:'wrap'.
 * Each child is sized based on the columns prop.
 */
export function Grid({ children, columns = 2, gap }: GridProps) {
  const theme = useTheme();
  const resolvedGap = gap ?? theme.spacing.md;

  const containerStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -(resolvedGap / 2),
    marginVertical: -(resolvedGap / 2),
  };

  return (
    <View style={containerStyle}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        const itemWidth = `${100 / columns}%` as unknown as number;
        return (
          <View
            style={{
              width: itemWidth,
              paddingHorizontal: resolvedGap / 2,
              paddingVertical: resolvedGap / 2,
            }}
          >
            {child}
          </View>
        );
      })}
    </View>
  );
}
