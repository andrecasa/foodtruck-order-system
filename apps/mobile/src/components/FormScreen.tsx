import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { Header } from './Layout';

export interface FormScreenProps {
  /** Screen title shown in the AppBar/Header. */
  title: string;
  /** Back handler for the header's back arrow. */
  onBack?: () => void;
  /** Scrollable form content. */
  children: React.ReactNode;
  /** Style applied to the ScrollView's contentContainerStyle. */
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Fixed footer (e.g. BottomNav). Rendered below the scroll area, lifts with keyboard. */
  footer?: React.ReactNode;
  /**
   * Fixed content pinned between the Header and the scroll area (e.g. a name
   * field that should stay visible while the content scrolls). Does not scroll.
   */
  stickyHeader?: React.ReactNode;
}

/**
 * Layout for form screens with a fixed Header, a scrollable content area,
 * and an optional fixed footer (e.g. BottomNav).
 *
 * Keyboard handling:
 * On Android with edge-to-edge (SDK 54+), the OS no longer resizes the window
 * when the keyboard opens. This component tracks the keyboard height and applies
 * it as paddingBottom to a wrapper, which:
 *  - shrinks the ScrollView (activating scroll)
 *  - lifts the footer above the keyboard
 * The Header stays fixed at the top.
 */
export function FormScreen({ title, onBack, children, contentContainerStyle, footer, stickyHeader }: FormScreenProps) {
  const theme = useTheme();
  const keyboardHeight = useKeyboardHeight();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['top', 'bottom']}
    >
      <Header title={title} onBack={onBack} />

      {stickyHeader}

      <View style={{ flex: 1, paddingBottom: keyboardHeight }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {/* Hide footer while the keyboard is open — matches the tab bar's
            tabBarHideOnKeyboard behavior for a consistent UX across screens. */}
        {keyboardHeight === 0 && footer}
      </View>
    </SafeAreaView>
  );
}
