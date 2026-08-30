/**
 * Builds the target for the customer bottom nav's "Pedidos" tab.
 *
 * "Pedidos" opens the session orders list (`/:slug/pedidos`), which shows every
 * order placed this session and lets the customer open any of them for
 * tracking. Kept as one shared helper so every screen that renders
 * `CustomerBottomNav` (menu, checkout, orders list, tracking) points to the
 * same target.
 */
export function ordersHref(slug: string): string {
  return `/${encodeURIComponent(slug)}/pedidos`;
}
