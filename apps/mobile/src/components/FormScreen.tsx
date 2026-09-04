import React, { useEffect, useState } from 'react';
import { ScrollView, View, KeyboardAvoidingView, Keyboard, Platform, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
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
  /** Fixed footer (e.g. floating action buttons). Rendered below the scroll area. */
  footer?: React.ReactNode;
  /**
   * Fixed content pinned between the Header and the scroll area (e.g. a name
   * field that should stay visible while the content scrolls). Does not scroll.
   */
  stickyHeader?: React.ReactNode;
  /**
   * Whether to hide the footer while the keyboard is open. Defaults to `true`,
   * which suits screens whose focused inputs sit near the bottom (so the footer
   * would overlap them). Set to `false` when the focused field is at the top
   * (e.g. a sticky-header name field) and the bottom CTA must stay reachable
   * while typing.
   */
  hideFooterOnKeyboard?: boolean;
}

/**
 * Tracks whether the software keyboard is currently visible.
 * Used to hide the fixed footer while typing (mirrors the tab bar's
 * `tabBarHideOnKeyboard` behavior) without coupling to keyboard height.
 */
function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // iOS emits Will* (smoother); Android emits Did* events.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return visible;
}

/**
 * Layout for form screens with a fixed Header, a scrollable content area,
 * and an optional fixed footer (e.g. BottomNav / floating CTA).
 *
 * Keyboard handling:
 * Uses `KeyboardAvoidingView` — the idiomatic, Expo-recommended approach. On
 * iOS 'padding' lifts the content; on Android edge-to-edge (SDK 54+) the mere
 * presence of the view keeps focused inputs visible (behavior undefined). This
 * replaces the previous manual `paddingBottom: keyboardHeight` offset, which
 * double-offset the content and clipped the top of the screen (the same bug that
 * hid the login logo/title when a field was focused).
 *
 * The footer is hidden while the keyboard is open so it doesn't overlap the
 * focused field.
 */
export function FormScreen({ title, onBack, children, contentContainerStyle, footer, stickyHeader, hideFooterOnKeyboard = true }: FormScreenProps) {
  const theme = useTheme();
  const keyboardVisible = useKeyboardVisible();
  // Hide the footer only when requested AND the keyboard is actually open.
  const footerHidden = hideFooterOnKeyboard && keyboardVisible;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={['top', 'bottom']}
    >
      <Header title={title} onBack={onBack} />

      {stickyHeader}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // iOS: 'padding' lifts content above the keyboard. Android (edge-to-edge,
        // no auto window resize): 'height' shrinks this view when the keyboard
        // opens, which also lifts the absolutely-positioned footer (FloatingButton
        // pinned at bottom:16) above the keyboard so the CTA stays reachable.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {/* Footer is hidden while typing only when hideFooterOnKeyboard is set
            (default) — matches the tab bar's tabBarHideOnKeyboard behavior for
            screens whose inputs sit near the bottom. Screens with a top-anchored
            field keep the footer visible so the CTA stays reachable. */}
        {!footerHidden && footer}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
