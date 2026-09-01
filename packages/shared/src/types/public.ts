export interface PublicMenuItem {
  id: string;
  name: string;
  priceCents: number;
  categoryName: string;
}

export interface PublicMenuCategory {
  name: string;
  sortOrder: number;
  items: PublicMenuItem[];
}

export interface PublicBranding {
  businessName: string;
  logoUrl: string | null;
  /**
   * Fully-resolved theme (tenant partial override merged over the neutral
   * platform theme). Every token has a value, matching the authenticated
   * branding contract so the customer and operator apps render identically.
   */
  theme: Record<string, unknown>;
  slug: string;
  realtimeChannel: string;
}

export interface PublicOrderResponse {
  id: string;
  dailyNumber: number;
  customerName: string;
  status: string;
  /** Payment status ('pendente' | 'pago') so the customer sees if it's paid. */
  paymentStatus: string;
  /**
   * Order origin ('web' | 'presencial' | 'whatsapp'). Customer-placed orders
   * are always 'web'; exposed so the order card can show an origin badge and
   * to keep the contract ready for other origins.
   */
  origin: string;
  totalAmountCents: number;
  orderDate: string;
  createdAt: string;
  items: { itemName: string; quantity: number; unitPriceCents: number }[];
}
