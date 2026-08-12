import type {
  MenuItem,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  Order,
  OrderStatus,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  RegisterPaymentRequest,
  DailySummary,
} from '@order-system/shared';
import type { ApiClient } from './types';

function notImplemented(method: string): never {
  throw new Error(`[realClient] ${method} is not implemented yet. Connect a real backend first.`);
}

export const realClient: ApiClient = {
  async login(_email: string, _password: string): Promise<{ token: string }> {
    return notImplemented('login');
  },

  async logout(): Promise<void> {
    return notImplemented('logout');
  },

  async getMenu(): Promise<MenuItem[]> {
    return notImplemented('getMenu');
  },

  async createMenuItem(_data: CreateMenuItemRequest): Promise<MenuItem> {
    return notImplemented('createMenuItem');
  },

  async updateMenuItem(_id: string, _data: UpdateMenuItemRequest): Promise<MenuItem> {
    return notImplemented('updateMenuItem');
  },

  async toggleMenuItemStatus(_id: string): Promise<MenuItem> {
    return notImplemented('toggleMenuItemStatus');
  },

  async getOrders(_filter?: { status?: OrderStatus[] }): Promise<Order[]> {
    return notImplemented('getOrders');
  },

  async createOrder(_data: CreateOrderRequest): Promise<Order> {
    return notImplemented('createOrder');
  },

  async updateOrderStatus(_id: string, _data: UpdateOrderStatusRequest): Promise<Order> {
    return notImplemented('updateOrderStatus');
  },

  async registerPayment(_id: string, _data: RegisterPaymentRequest): Promise<Order> {
    return notImplemented('registerPayment');
  },

  async getDailySummary(): Promise<DailySummary> {
    return notImplemented('getDailySummary');
  },
};
