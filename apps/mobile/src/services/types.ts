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
import type {
  UserResponse,
  ListUsersResponse,
  CreateUserInput,
  UpdateUserInput,
  UserFilters,
  UserStatus,
} from '../types/user';

export interface ApiClient {
  // Auth
  login(email: string, password: string): Promise<{ token: string }>;
  logout(): Promise<void>;

  // Password reset (unauthenticated flow)
  requestPasswordReset(email: string): Promise<void>;
  confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void>;

  // Menu
  getMenu(): Promise<MenuItem[]>;
  getAllMenuItems(): Promise<MenuItem[]>;
  createMenuItem(data: CreateMenuItemRequest): Promise<MenuItem>;
  updateMenuItem(id: string, data: UpdateMenuItemRequest): Promise<MenuItem>;
  toggleMenuItemStatus(id: string): Promise<MenuItem>;
  deleteMenuItem(id: string): Promise<void>;

  // Orders
  getOrders(filter?: { status?: OrderStatus[]; date?: string }): Promise<Order[]>;
  getOrderById(id: string): Promise<Order>;
  createOrder(data: CreateOrderRequest): Promise<Order>;
  updateOrderStatus(id: string, data: UpdateOrderStatusRequest): Promise<Order>;
  updateOrderItems(orderId: string, data: UpdateOrderItemsRequest): Promise<Order>;
  deleteOrder(id: string): Promise<void>;

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

  // Users
  listUsers(filters?: UserFilters): Promise<ListUsersResponse>;
  getUserById(id: string): Promise<UserResponse>;
  createUser(data: CreateUserInput): Promise<UserResponse>;
  updateUser(id: string, data: UpdateUserInput): Promise<UserResponse>;
  toggleUserStatus(id: string, status: UserStatus): Promise<UserResponse>;
  deleteUser(id: string): Promise<void>;
  resetPassword(id: string, password: string): Promise<void>;
}
