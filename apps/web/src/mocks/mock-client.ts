import type {
  Order,
  OrderStatus,
  MenuItem,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  RegisterPaymentRequest,
  DailySummary,
  PaymentMethod,
} from '@order-system/shared';
import { isValidTransition } from '@order-system/shared';
import type { ApiClient } from '../services/types';
import { menuItems, activeMenuItems } from './menu-data';
import { orders as initialOrders } from './orders-data';

const REALTIME_DELAY_MS = 10_000;

class MockClient implements ApiClient {
  private orders: Order[] = [...initialOrders];
  private nextDailyNumber: number;
  private subscribers: Set<(order: Order) => void> = new Set();
  private autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const maxNumber = this.orders.reduce(
      (max, o) => Math.max(max, o.dailyNumber),
      0,
    );
    this.nextDailyNumber = maxNumber + 1;
    this.startAutoAdvance();
  }

  // --- Auth ---

  async login(_email: string, _password: string): Promise<{ token: string }> {
    return { token: 'mock-jwt-token-preparador' };
  }

  async logout(): Promise<void> {
    this.stopAutoAdvance();
  }

  // --- Menu ---

  async getMenu(): Promise<MenuItem[]> {
    return [...activeMenuItems];
  }

  // --- Orders ---

  async getOrders(filter?: { status?: OrderStatus[] }): Promise<Order[]> {
    let result = [...this.orders];
    if (filter?.status && filter.status.length > 0) {
      result = result.filter((o) => filter.status!.includes(o.status));
    }
    // Sort by createdAt ascending (oldest first)
    result.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return result;
  }

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    const items = data.items.map((item) => {
      const menuItem = menuItems.find((m) => m.id === item.menuItemId);
      if (!menuItem) {
        throw new Error(`Menu item not found: ${item.menuItemId}`);
      }
      return {
        menuItemId: item.menuItemId,
        name: menuItem.name,
        quantity: item.quantity,
        unitPrice: menuItem.price,
      };
    });

    const totalAmount = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    const order: Order = {
      id: `order-${String(Date.now()).slice(-6)}`,
      dailyNumber: this.nextDailyNumber++,
      customerName: data.customerName,
      origin: data.origin,
      status: 'aguardando',
      paymentStatus: 'pendente',
      items,
      totalAmount,
      createdAt: new Date().toISOString(),
    };

    this.orders.push(order);
    this.notifySubscribers(order);
    return { ...order };
  }

  async updateOrderStatus(
    id: string,
    data: UpdateOrderStatusRequest,
  ): Promise<Order> {
    const index = this.orders.findIndex((o) => o.id === id);
    if (index === -1) {
      throw new Error(`Order not found: ${id}`);
    }

    const order = this.orders[index]!;
    if (!isValidTransition(order.status, data.status)) {
      throw new Error(
        `Invalid transition: ${order.status} → ${data.status}`,
      );
    }

    const now = new Date().toISOString();
    const updated: Order = { ...order, status: data.status };

    if (data.status === 'preparando') {
      updated.startedAt = now;
    } else if (data.status === 'pronto') {
      updated.readyAt = now;
    } else if (data.status === 'entregue') {
      updated.deliveredAt = now;
    }

    this.orders[index] = updated;
    this.notifySubscribers(updated);
    return { ...updated };
  }

  // --- Payment ---

  async registerPayment(
    id: string,
    data: RegisterPaymentRequest,
  ): Promise<Order> {
    const index = this.orders.findIndex((o) => o.id === id);
    if (index === -1) {
      throw new Error(`Order not found: ${id}`);
    }

    const order = this.orders[index]!;
    if (order.paymentStatus === 'pago') {
      throw new Error('Payment already registered');
    }

    const updated: Order = {
      ...order,
      paymentStatus: 'pago',
      paymentMethod: data.paymentMethod,
      paidAt: new Date().toISOString(),
    };

    this.orders[index] = updated;
    this.notifySubscribers(updated);
    return { ...updated };
  }

  // --- Summary ---

  async getDailySummary(): Promise<DailySummary> {
    const today = new Date().toISOString().split('T')[0] as string;
    const paidOrders = this.orders.filter((o) => o.paymentStatus === 'pago');
    const pendingOrders = this.orders.filter((o) => o.paymentStatus === 'pendente');

    const byPaymentMethod: Record<PaymentMethod, number> = {
      dinheiro: 0,
      pix: 0,
      cartão: 0,
    };

    for (const order of paidOrders) {
      if (order.paymentMethod) {
        byPaymentMethod[order.paymentMethod] += order.totalAmount;
      }
    }

    return {
      date: today,
      totalOrders: this.orders.length,
      paidOrders: paidOrders.length,
      pendingOrders: pendingOrders.length,
      paidTotal: paidOrders.reduce((sum, o) => sum + o.totalAmount, 0),
      pendingTotal: pendingOrders.reduce((sum, o) => sum + o.totalAmount, 0),
      byPaymentMethod,
    };
  }

  // --- Realtime ---

  onOrderUpdate(callback: (order: Order) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // --- Private ---

  private notifySubscribers(order: Order): void {
    for (const callback of this.subscribers) {
      callback(order);
    }
  }

  private startAutoAdvance(): void {
    this.autoAdvanceTimer = setTimeout(() => {
      this.advanceFirstAguardando();
      this.scheduleNextAutoAdvance();
    }, REALTIME_DELAY_MS);
  }

  private scheduleNextAutoAdvance(): void {
    this.autoAdvanceTimer = setTimeout(() => {
      this.advanceFirstAguardando();
      this.scheduleNextAutoAdvance();
    }, REALTIME_DELAY_MS);
  }

  private advanceFirstAguardando(): void {
    const aguardandoOrder = this.orders.find((o) => o.status === 'aguardando');
    if (!aguardandoOrder) return;

    const index = this.orders.indexOf(aguardandoOrder);
    const updated: Order = {
      ...aguardandoOrder,
      status: 'preparando',
      startedAt: new Date().toISOString(),
    };

    this.orders[index] = updated;
    this.notifySubscribers(updated);
  }

  private stopAutoAdvance(): void {
    if (this.autoAdvanceTimer) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }
}

export const mockClient: ApiClient = new MockClient();
