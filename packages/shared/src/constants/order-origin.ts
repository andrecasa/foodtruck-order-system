import type { OrderOrigin } from '../types/order';

/**
 * Color role for an origin badge — resolved to a concrete theme token by each
 * app (mobile RN / web DOM), since the actual color values live in each app's
 * theme. Remote origins (web + whatsapp) share one role; presencial another.
 */
export type OrderOriginColorRole = 'remote' | 'presencial';

/** Visual descriptor for an order-origin badge (icon + label + color role). */
export interface OrderOriginBadge {
  /** Material Symbols icon glyph. */
  icon: string;
  /** Human-facing Portuguese label. */
  label: string;
  /** Color role, mapped to a theme token by the consuming app. */
  colorRole: OrderOriginColorRole;
}

/**
 * Single source of truth for how an order origin is presented as a badge,
 * shared by the operator (web + mobile) and customer apps so the mapping never
 * diverges. In particular, `web` is ALWAYS "QrCode" (pedido online do cliente).
 *
 * Unknown origins fall back to the presencial descriptor.
 */
const ORDER_ORIGIN_BADGES: Record<OrderOrigin, OrderOriginBadge> = {
  presencial: { icon: 'storefront', label: 'Presencial', colorRole: 'presencial' },
  whatsapp: { icon: 'chat', label: 'WhatsApp', colorRole: 'remote' },
  web: { icon: 'qr_code', label: 'QrCode', colorRole: 'remote' },
};

/**
 * Returns the badge descriptor (icon, label, colorRole) for an order origin.
 * Accepts a plain string for convenience (API payloads type origin as string);
 * unknown values fall back to the presencial descriptor.
 */
export function getOrderOriginBadge(origin: string): OrderOriginBadge {
  return ORDER_ORIGIN_BADGES[origin as OrderOrigin] ?? ORDER_ORIGIN_BADGES.presencial;
}
