import React from 'react';
import { getOrderOriginBadge } from '@order-system/shared';
import { useTheme } from '../theme';
import { Badge } from './Badge';

export interface OriginBadgeProps {
  /** Order origin ('web' | 'presencial' | 'whatsapp'). */
  origin: string;
  /** Optional test ID forwarded to the underlying Badge. */
  testID?: string;
}

/**
 * Origin badge — shared across the operator (OrderQueueScreen, PaymentScreen)
 * and customer (CustomerOrderCard) screens so the origin icon/label/color never
 * diverge. The icon + label come from the single source of truth in
 * `@order-system/shared` (`getOrderOriginBadge`); `web` always renders as
 * "QrCode" (pedido online do cliente).
 *
 * Color role → theme token: remote origins (web + whatsapp) use the sage-green
 * `success` tone, presencial uses the amber `preparando` tone — matching the
 * previous per-screen logic. Uses `opacitySuffix="14"` (the operator badge
 * standard).
 */
export function OriginBadge({ origin, testID }: OriginBadgeProps) {
  const theme = useTheme();
  const { icon, label, colorRole } = getOrderOriginBadge(origin);
  const color = colorRole === 'remote' ? theme.colors.success : theme.colors.preparando;

  return <Badge icon={icon} label={label} color={color} opacitySuffix="14" testID={testID} />;
}
