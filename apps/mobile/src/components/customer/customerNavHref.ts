/**
 * Shared route builders for the customer (public) flow, so every screen that
 * renders `CustomerBottomNav` (home, menu, orders list, checkout) points to the
 * same targets.
 */

/**
 * Builds the target for the customer bottom nav's "Home" tab.
 *
 * Home is the tenant landing page (`/:slug/home`) with logo + QR code and a
 * "Novo Pedido" button. The PWA root (`/:slug`) redirects to the orders list,
 * so the Home lives at its own `/:slug/home` route.
 */
export function homeHref(slug: string): string {
  return `/${encodeURIComponent(slug)}/home`;
}

/**
 * Builds the target for the customer bottom nav's "Novo" tab (`/:slug/new-order`)
 * — the tenant menu / new order screen.
 */
export function menuHref(slug: string): string {
  return `/${encodeURIComponent(slug)}/new-order`;
}

/**
 * Builds the target for the customer bottom nav's "Pedidos" tab.
 *
 * "Pedidos" opens the session orders list (`/:slug/orders`), which shows every
 * order placed this session and lets the customer open any of them for
 * tracking.
 */
export function ordersHref(slug: string): string {
  return `/${encodeURIComponent(slug)}/orders`;
}
