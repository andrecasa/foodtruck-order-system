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

export interface ApiClient {
  // Auth
  login(email: string, password: string): Promise<{ token: string }>;
  logout(): Promise<void>;

  // Menu
  getMenu(): Promise<MenuItem[]>;
  createMenuItem(data: CreateMenuItemRequest): Promise<MenuItem>;
  updateMenuItem(id: string, data: UpdateMenuItemRequest): Promise<MenuItem>;
  toggleMenuItemStatus(id: string): Promise<MenuItem>;

  // Orders
  getOrders(filter?: { status?: OrderStatus[] }): Promise<Order[]>;
  createOrder(data: CreateOrderRequest): Promise<Order>;
  updateOrderStatus(id: string, data: UpdateOrderStatusRequest): Promise<Order>;

  // Payment
  registerPayment(id: string, data: RegisterPaymentRequest): Promise<Order>;

  // Summary
  getDailySummary(): Promise<DailySummary>;
}
