import type { Order } from '@order-system/shared';

export const orders: Order[] = [
  {
    id: 'order-001',
    dailyNumber: 1,
    customerName: 'Carlos Mendes',
    origin: 'presencial',
    status: 'pronto',
    paymentStatus: 'pago',
    paymentMethod: 'cartão',
    items: [
      { menuItemId: 'menu-004', name: 'Pastel de Pizza', quantity: 3, unitPrice: 1300 },
      { menuItemId: 'menu-009', name: 'Refrigerante Lata', quantity: 2, unitPrice: 600 },
    ],
    totalAmount: 5100,
    createdAt: '2024-01-15T10:45:00.000Z',
    startedAt: '2024-01-15T10:48:00.000Z',
    readyAt: '2024-01-15T10:55:00.000Z',
    paidAt: '2024-01-15T10:45:00.000Z',
  },
  {
    id: 'order-002',
    dailyNumber: 2,
    customerName: 'João Silva',
    origin: 'presencial',
    status: 'aguardando',
    paymentStatus: 'pendente',
    items: [
      { menuItemId: 'menu-001', name: 'Pastel de Carne', quantity: 2, unitPrice: 1200 },
      { menuItemId: 'menu-008', name: 'Caldo de Cana', quantity: 1, unitPrice: 800 },
    ],
    totalAmount: 3200,
    createdAt: '2024-01-15T11:00:00.000Z',
  },
  {
    id: 'order-003',
    dailyNumber: 3,
    customerName: 'Maria Oliveira',
    origin: 'whatsapp',
    status: 'preparando',
    paymentStatus: 'pago',
    paymentMethod: 'pix',
    items: [
      { menuItemId: 'menu-003', name: 'Pastel de Frango com Catupiry', quantity: 1, unitPrice: 1400 },
      { menuItemId: 'menu-006', name: 'Pastel de Chocolate', quantity: 2, unitPrice: 1000 },
    ],
    totalAmount: 3400,
    createdAt: '2024-01-15T11:05:00.000Z',
    startedAt: '2024-01-15T11:08:00.000Z',
    paidAt: '2024-01-15T11:05:00.000Z',
  },
  {
    id: 'order-004',
    dailyNumber: 4,
    customerName: 'Ana Souza',
    origin: 'whatsapp',
    status: 'aguardando',
    paymentStatus: 'pago',
    paymentMethod: 'dinheiro',
    items: [
      { menuItemId: 'menu-002', name: 'Pastel de Queijo', quantity: 2, unitPrice: 1000 },
      { menuItemId: 'menu-007', name: 'Pastel de Romeu e Julieta', quantity: 1, unitPrice: 1100 },
    ],
    totalAmount: 3100,
    createdAt: '2024-01-15T11:10:00.000Z',
    paidAt: '2024-01-15T11:10:00.000Z',
  },
];

/** Orders in the kitchen queue (aguardando or preparando) */
export const queueOrders = orders.filter(
  (order) => order.status === 'aguardando' || order.status === 'preparando',
);

/** Orders that are ready for pickup */
export const readyOrders = orders.filter((order) => order.status === 'pronto');
