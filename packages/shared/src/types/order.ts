export type OrderStatus = 'aguardando' | 'preparando' | 'pronto' | 'entregue';
export type PaymentStatus = 'pendente' | 'pago';
export type OrderOrigin = 'presencial' | 'whatsapp' | 'web';
export type PaymentMethod = 'dinheiro' | 'pix' | 'cartão débito' | 'cartão crédito';

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  dailyNumber: number;
  customerName: string;
  origin: OrderOrigin;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  items: OrderItem[];
  totalAmount: number;
  createdAt: string;
  startedAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  paidAt?: string;
  /** Latitude capturada no cliente ao confirmar o pedido (opcional). */
  latitude?: number;
  /** Longitude capturada no cliente ao confirmar o pedido (opcional). */
  longitude?: number;
}

export interface CreateOrderRequest {
  customerName: string;
  origin: OrderOrigin;
  items: { menuItemId: string; quantity: number }[];
  /** Latitude opcional; ausente quando o cliente nega a localização. */
  latitude?: number;
  /** Longitude opcional; ausente quando o cliente nega a localização. */
  longitude?: number;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

export interface RegisterPaymentRequest {
  paymentMethod: PaymentMethod;
}

export interface UpdateOrderItemsRequest {
  items: { menuItemId: string; quantity: number }[];
  customerName?: string;
  origin?: OrderOrigin;
}
