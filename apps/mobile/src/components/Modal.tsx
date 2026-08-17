import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  Pressable,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type ModalVariant = 'default' | 'danger';

export interface ModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Title displayed at the top of the modal */
  title: string;
  /** Modal body content */
  children: React.ReactNode;
  /** Label for the confirm button */
  confirmLabel?: string;
  /** Label for the cancel button */
  cancelLabel?: string;
  /** Callback when confirm button is pressed */
  onConfirm?: () => void;
  /** Callback when cancel button is pressed */
  onCancel?: () => void;
  /** Visual variant: 'default' uses primary color, 'danger' uses error color */
  variant?: ModalVariant;
  /** Optional test ID */
  testID?: string;
}

/**
 * Themed Modal component for React Native.
 * Used for confirming actions like payment registration, status changes, etc.
 * All visual values come from the ThemeConfig via useTheme().
 */
export function Modal({
  visible,
  onClose,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'default',
  testID,
}: ModalProps) {
  const theme = useTheme();

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  const confirmColor =
    variant === 'danger' ? theme.colors.error : theme.colors.primary;

  const overlayStyle: ViewStyle = {
    flex: 1,
    backgroundColor: 'rgba(33, 33, 33, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  };

  const containerStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    gap: 16,
    elevation: 5,
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
  };

  const titleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 18,
    fontWeight: '500',
    color: theme.colors.text,
  };

  const bodyStyle: ViewStyle = {
  };

  const actionsStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  };

  const confirmButtonStyle: ViewStyle = {
    backgroundColor: confirmColor,
    borderRadius: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  };

  const confirmTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.surface,
  };

  const cancelButtonStyle: ViewStyle = {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.textSecondary,
    borderRadius: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  };

  const cancelTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.textSecondary,
  };

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
      testID={testID}
    >
      <Pressable
        style={overlayStyle}
        onPress={onClose}
        accessibilityRole="none"
        accessibilityLabel="Fechar modal"
      >
        <Pressable
          style={containerStyle}
          onPress={() => {}}
          accessibilityRole="none"
          accessibilityLabel={title}
        >
          <Text
            style={titleStyle}
            accessibilityRole="header"
          >
            {title}
          </Text>

          <View style={bodyStyle}>{children}</View>

          <View style={actionsStyle}>
            <Pressable
              style={cancelButtonStyle}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text style={cancelTextStyle}>{cancelLabel}</Text>
            </Pressable>

            {onConfirm && (
              <Pressable
                style={confirmButtonStyle}
                onPress={onConfirm}
                accessibilityRole="button"
                accessibilityLabel={confirmLabel}
              >
                <Text style={confirmTextStyle}>{confirmLabel}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
