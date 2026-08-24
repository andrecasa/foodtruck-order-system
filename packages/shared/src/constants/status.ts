import type { OrderStatus, PaymentStatus, OrderOrigin, PaymentMethod } from '../types/order';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'aguardando',
  'preparando',
  'pronto',
  'entregue',
] as const;

export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'pendente',
  'pago',
] as const;

export const ORDER_ORIGINS: readonly OrderOrigin[] = [
  'presencial',
  'whatsapp',
] as const;

export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'dinheiro',
  'pix',
  'cartão débito',
  'cartão crédito',
] as const;

export const VALID_TRANSITIONS: Readonly<Partial<Record<OrderStatus, OrderStatus>>> = {
  aguardando: 'preparando',
  preparando: 'pronto',
  pronto: 'entregue',
} as const;

export function isValidTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from] === to;
}
