import type React from 'react';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useTheme } from '../theme';

/**
 * Prova de conceito de modal acessível com Radix Dialog, estilizado 100% pelo
 * tema do projeto (`useTheme()`), sem cores/tamanhos hardcoded.
 *
 * O Radix cuida da acessibilidade "de graça" (foco preso no diálogo, fechamento
 * por Esc/clique no backdrop, `role="dialog"` + `aria-modal`, e associação de
 * título/descrição via `Dialog.Title`/`Dialog.Description`), enquanto o visual é
 * inteiramente derivado dos tokens de tema — mostrando o baixo atrito de adotar
 * um primitivo headless mantendo os padrões do `apps/web`.
 *
 * Todos os elementos interativos expõem `data-testid` para os testes.
 */
export function FeatureModal() {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  const fontFamily = `"${theme.typography.fontFamily}", -apple-system, sans-serif`;

  const triggerStyle: React.CSSProperties = {
    backgroundColor: 'transparent',
    color: theme.colors.primary,
    border: `1px solid ${theme.colors.primary}`,
    borderRadius: `${theme.borderRadius.full}px`,
    padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.medium,
    cursor: 'pointer',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: `${theme.spacing.lg}px`,
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    backgroundColor: theme.colors.surface,
    borderRadius: `${theme.borderRadius.lg}px`,
    border: `1px solid ${theme.colors.border}`,
    padding: `${theme.spacing.xl}px`,
    width: '100%',
    maxWidth: '480px',
    display: 'flex',
    flexDirection: 'column',
    gap: `${theme.spacing.md}px`,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
  };

  const titleStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.xl}px`,
    fontWeight: theme.typography.weights.bold,
    color: theme.colors.text,
    margin: 0,
  };

  const descriptionStyle: React.CSSProperties = {
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.regular,
    color: theme.colors.textSecondary,
    margin: 0,
    lineHeight: 1.5,
  };

  const closeStyle: React.CSSProperties = {
    alignSelf: 'flex-end',
    backgroundColor: theme.colors.primary,
    color: theme.colors.surface,
    border: 'none',
    borderRadius: `${theme.borderRadius.full}px`,
    padding: `${theme.spacing.sm}px ${theme.spacing.lg}px`,
    fontFamily,
    fontSize: `${theme.typography.sizes.md}px`,
    fontWeight: theme.typography.weights.bold,
    cursor: 'pointer',
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          style={triggerStyle}
          data-testid="landing-feature-modal-trigger"
          aria-label="Ver detalhes das funcionalidades"
        >
          Ver detalhes
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay style={overlayStyle}>
          <Dialog.Content style={contentStyle} data-testid="landing-feature-modal">
            <Dialog.Title style={titleStyle}>Tudo pronto para vender</Dialog.Title>
            <Dialog.Description style={descriptionStyle}>
              Cardápio digital, pedidos pelo WhatsApp e uma fila organizada em
              tempo real. Você começa com 30 dias grátis, sem cartão de crédito.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                style={closeStyle}
                data-testid="landing-feature-modal-close"
                aria-label="Fechar detalhes"
              >
                Entendi
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
