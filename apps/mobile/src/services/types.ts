import type {
  MenuItem,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  Order,
  OrderStatus,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  UpdateOrderItemsRequest,
  RegisterPaymentRequest,
  DailySummary,
  MonthlySummaryResponse,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoriesRequest,
} from '@order-system/shared';

export interface ApiClient {
  // Auth
  login(email: string, password: string): Promise<{ token: string }>;
  logout(): Promise<void>;

  // Menu
  getMenu(): Promise<MenuItem[]>;
  getAllMenuItems(): Promise<MenuItem[]>;
  createMenuItem(data: CreateMenuItemRequest): Promise<MenuItem>;
  updateMenuItem(id: string, data: UpdateMenuItemRequest): Promise<MenuItem>;
  toggleMenuItemStatus(id: string): Promise<MenuItem>;
  deleteMenuItem(id: string): Promise<void>;

  // Orders
  getOrders(filter?: { status?: OrderStatus[] }): Promise<Order[]>;
  createOrder(data: CreateOrderRequest): Promise<Order>;
  updateOrderStatus(id: string, data: UpdateOrderStatusRequest): Promise<Order>;
  updateOrderItems(orderId: string, data: UpdateOrderItemsRequest): Promise<Order>;

  // Payment
  registerPayment(id: string, data: RegisterPaymentRequest): Promise<Order>;

  // Summary
  getDailySummary(date?: string): Promise<DailySummary>;
  getMonthlySummary(year: number, month: number): Promise<MonthlySummaryResponse>;

  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(data: CreateCategoryRequest): Promise<Category>;
  updateCategory(id: string, data: UpdateCategoryRequest): Promise<Category>;
  reorderCategories(data: ReorderCategoriesRequest): Promise<Category[]>;
  toggleCategoryStatus(id: string, action: 'activate' | 'deactivate'): Promise<Category>;
  deleteCategory(id: string): Promise<void>;
}
