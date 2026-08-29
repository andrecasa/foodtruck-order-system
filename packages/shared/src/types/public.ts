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
  theme: Record<string, unknown> | null;
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
  totalAmountCents: number;
  orderDate: string;
  createdAt: string;
  items: { itemName: string; quantity: number; unitPriceCents: number }[];
}
