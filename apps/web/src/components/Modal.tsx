import React, { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../theme/ThemeProvider';

export type ModalVariant = 'default' | 'danger';

export interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
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
  /** Callback when confirm button is clicked */
  onConfirm?: () => void;
  /** Callback when cancel button is clicked */
  onCancel?: () => void;
  /** Visual variant: 'default' uses primary color, 'danger' uses error color */
  variant?: ModalVariant;
}

/**
 * Themed Modal component for web.
 * Renders via React Portal with an overlay backdrop.
 * Used for confirming actions like payment registration, status changes, etc.
 * All visual values come from the ThemeConfig via useTheme().
 *
 * Accessibility:
 * - Focus trap: Tab/Shift+Tab cycles through modal elements only
 * - Escape key closes the modal
 * - aria-modal="true" and role="dialog"
 * - Backdrop click closes the modal
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  variant = 'default',
}: ModalProps) {
  const theme = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onClose();
    }
  };

  // Focus trap logic
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab') return;

      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    },
    [onClose]
  );

  // Manage focus on open/close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.addEventListener('keydown', handleKeyDown);

      // Focus the first focusable element in the modal
      requestAnimationFrame(() => {
        const modal = modalRef.current;
        if (modal) {
          const firstFocusable = modal.querySelector<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          }
        }
      });
    } else {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore previous focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const confirmColor =
    variant === 'danger' ? theme.colors.error : theme.colors.primary;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(33, 33, 33, 0.4)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: `${theme.spacing.lg}px`,
    zIndex: 1000,
  };

  const containerStyle: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    borderRadius: '16px',
    padding: '24px',
    width: '100%',
    maxWidth: '360px',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '18px',
    fontWeight: 400,
    color: theme.colors.text,
    margin: 0,
  };

  const bodyStyle: React.CSSProperties = {
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '14px',
    fontWeight: 400,
    color: '#8B6B5A',
  };

  const actionsStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  };

  const confirmButtonStyle: React.CSSProperties = {
    backgroundColor: confirmColor,
    color: '#FFFFFF',
    border: 'none',
    borderRadius: '18px',
    height: '36px',
    padding: '0 20px',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '13px',
    fontWeight: 400,
    cursor: 'pointer',
  };

  const cancelButtonStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: '#8B6B5A',
    border: 'none',
    borderRadius: '18px',
    height: '36px',
    padding: '0 20px',
    fontFamily: `"${theme.typography.fontFamily}", -apple-system, sans-serif`,
    fontSize: '13px',
    fontWeight: 400,
    cursor: 'pointer',
  };

  const modalContent = (
    <div
      style={overlayStyle}
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        style={containerStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" style={titleStyle}>
          {title}
        </h2>

        <div style={bodyStyle}>{children}</div>

        <div style={actionsStyle}>
          <button
            type="button"
            style={cancelButtonStyle}
            onClick={handleCancel}
          >
            {cancelLabel}
          </button>

          {onConfirm && (
            <button
              type="button"
              style={confirmButtonStyle}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
