export type OrderStatus = 'aguardando' | 'preparando' | 'pronto' | 'entregue';
export type PaymentStatus = 'pendente' | 'pago';
export type OrderOrigin = 'presencial' | 'whatsapp';
export type PaymentMethod = 'dinheiro' | 'pix' | 'cartão';

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
}

export interface CreateOrderRequest {
  customerName: string;
  origin: OrderOrigin;
  items: { menuItemId: string; quantity: number }[];
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
