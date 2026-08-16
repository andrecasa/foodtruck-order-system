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
import { isValidTransition } from '@order-system/shared';
import type { ApiClient } from '../services/types';
import { menuItems as initialMenuItems } from './menu-data';
import { orders as initialOrders } from './orders-data';

// In-memory state
let menuState: MenuItem[] = [...initialMenuItems];
let ordersState: Order[] = [...initialOrders];
let dailyCounter = initialOrders.length;
let categoriesState: Category[] = [
  { id: 'cat-1', name: 'Pastéis Salgados', sortOrder: 0, status: 'ativo', itemCount: 3, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'cat-2', name: 'Pastéis Doces', sortOrder: 1, status: 'ativo', itemCount: 2, createdAt: '2024-01-01T00:00:00Z' },
  { id: 'cat-3', name: 'Bebidas', sortOrder: 2, status: 'ativo', itemCount: 4, createdAt: '2024-01-01T00:00:00Z' },
];

function generateId(): string {
  return `mock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

function delay(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const mockClient: ApiClient = {
  // Auth
  async login(email: string, _password: string): Promise<{ token: string }> {
    await delay();
    return { token: `mock-token-${email}-${Date.now()}` };
  },

  async logout(): Promise<void> {
    await delay();
  },

  // Menu
  async getMenu(): Promise<MenuItem[]> {
    await delay();
    return menuState
      .filter((item) => item.status === 'ativo')
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  },

  async getAllMenuItems(): Promise<MenuItem[]> {
    await delay();
    return [...menuState].sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  },

  async createMenuItem(data: CreateMenuItemRequest): Promise<MenuItem> {
    await delay();
    const duplicate = menuState.find(
      (item) => item.name.toLowerCase() === data.name.toLowerCase() && item.status === 'ativo',
    );
    if (duplicate) {
      throw new Error('Item com este nome já existe (409)');
    }

    const timestamp = now();
    const newItem: MenuItem = {
      id: generateId(),
      name: data.name,
      price: data.price,
      category: data.category,
      status: 'ativo',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    menuState.push(newItem);
    return newItem;
  },

  async updateMenuItem(id: string, data: UpdateMenuItemRequest): Promise<MenuItem> {
    await delay();
    const index = menuState.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Item não encontrado (404)');
    }

    const existing = menuState[index]!;

    if (data.name) {
      const duplicate = menuState.find(
        (item) =>
          item.id !== id &&
          item.name.toLowerCase() === data.name!.toLowerCase() &&
          item.status === 'ativo',
      );
      if (duplicate) {
        throw new Error('Item com este nome já existe (409)');
      }
    }

    const updated: MenuItem = {
      ...existing,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.category !== undefined && { category: data.category }),
      updatedAt: now(),
    };
    menuState[index] = updated;
    return updated;
  },

  async toggleMenuItemStatus(id: string): Promise<MenuItem> {
    await delay();
    const index = menuState.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Item não encontrado (404)');
    }

    const item = menuState[index]!;
    const updated: MenuItem = {
      ...item,
      status: item.status === 'ativo' ? 'inativo' : 'ativo',
      updatedAt: now(),
    };
    menuState[index] = updated;
    return updated;
  },

  async deleteMenuItem(id: string): Promise<void> {
    await delay();
    const index = menuState.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error('Item não encontrado (404)');
    }
    menuState.splice(index, 1);
  },

  // Orders
  async getOrders(filter?: { status?: OrderStatus[] }): Promise<Order[]> {
    await delay();
    let result = [...ordersState];
    if (filter?.status && filter.status.length > 0) {
      result = result.filter((order) => filter.status!.includes(order.status));
    }
    return result.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  },

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    await delay();
    dailyCounter++;

    const items = data.items.map((reqItem) => {
      const menuItem = menuState.find((m) => m.id === reqItem.menuItemId);
      if (!menuItem || menuItem.status !== 'ativo') {
        throw new Error(`Item de cardápio não encontrado ou inativo: ${reqItem.menuItemId} (422)`);
      }
      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: reqItem.quantity,
        unitPrice: menuItem.price,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const newOrder: Order = {
      id: generateId(),
      dailyNumber: dailyCounter,
      customerName: data.customerName,
      origin: data.origin,
      status: 'aguardando',
      paymentStatus: 'pendente',
      items,
      totalAmount,
      createdAt: now(),
    };

    ordersState.push(newOrder);
    return newOrder;
  },

  async updateOrderStatus(id: string, data: UpdateOrderStatusRequest): Promise<Order> {
    await delay();
    const index = ordersState.findIndex((order) => order.id === id);
    if (index === -1) {
      throw new Error('Pedido não encontrado (404)');
    }

    const order = ordersState[index]!;
    if (!isValidTransition(order.status, data.status)) {
      throw new Error(
        `Transição inválida: ${order.status} → ${data.status} (422)`,
      );
    }

    const timestamp = now();
    const updated: Order = { ...order, status: data.status };

    if (data.status === 'preparando') {
      updated.startedAt = timestamp;
    } else if (data.status === 'pronto') {
      updated.readyAt = timestamp;
    } else if (data.status === 'entregue') {
      updated.deliveredAt = timestamp;
    }

    ordersState[index] = updated;
    return updated;
  },

  async updateOrderItems(orderId: string, data: UpdateOrderItemsRequest): Promise<Order> {
    await delay();
    const index = ordersState.findIndex((order) => order.id === orderId);
    if (index === -1) {
      throw new Error('Pedido não encontrado (404)');
    }

    const order = ordersState[index]!;
    if (order.status !== 'aguardando') {
      throw new Error('Pedido só pode ser editado no status aguardando (422)');
    }

    const items = data.items.map((reqItem) => {
      const menuItem = menuState.find((m) => m.id === reqItem.menuItemId);
      if (!menuItem || menuItem.status !== 'ativo') {
        throw new Error(`Item não encontrado ou inativo: ${reqItem.menuItemId} (422)`);
      }
      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: reqItem.quantity,
        unitPrice: menuItem.price,
      };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    const updated: Order = {
      ...order,
      items,
      totalAmount,
    };

    ordersState[index] = updated;
    return updated;
  },

  // Payment
  async registerPayment(id: string, data: RegisterPaymentRequest): Promise<Order> {
    await delay();
    const index = ordersState.findIndex((order) => order.id === id);
    if (index === -1) {
      throw new Error('Pedido não encontrado (404)');
    }

    const order = ordersState[index]!;
    if (order.paymentStatus === 'pago') {
      throw new Error('Pagamento já registrado para este pedido (409)');
    }

    const updated: Order = {
      ...order,
      paymentStatus: 'pago',
      paymentMethod: data.paymentMethod,
      paidAt: now(),
    };
    ordersState[index] = updated;
    return updated;
  },

  // Summary
  async getDailySummary(date?: string): Promise<DailySummary> {
    await delay();
    const targetDate = date ?? (new Date().toISOString().split('T')[0] ?? '');

    const paidOrders = ordersState.filter((o) => o.paymentStatus === 'pago');
    const pendingOrders = ordersState.filter((o) => o.paymentStatus === 'pendente');

    const paidTotal = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const pendingTotal = pendingOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    const byPaymentMethod = { dinheiro: 0, pix: 0, cartão: 0 };
    for (const order of paidOrders) {
      if (order.paymentMethod) {
        byPaymentMethod[order.paymentMethod] += order.totalAmount;
      }
    }

    return {
      date: targetDate,
      totalOrders: ordersState.length,
      paidOrders: paidOrders.length,
      pendingOrders: pendingOrders.length,
      paidTotal,
      pendingTotal,
      byPaymentMethod,
    };
  },

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummaryResponse> {
    await delay();
    const totalRevenue = ordersState.reduce((sum, o) => sum + o.totalAmount, 0);
    const paidOrders = ordersState.filter((o) => o.paymentStatus === 'pago');
    const totalReceived = paidOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalPending = totalRevenue - totalReceived;

    return {
      year,
      month,
      totals: {
        totalOrders: ordersState.length,
        totalRevenue,
        totalReceived,
        totalPending,
      },
      days: [],
    };
  },

  // Categories
  async getCategories(): Promise<Category[]> {
    await delay();
    return [...categoriesState].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  },

  async createCategory(data: CreateCategoryRequest): Promise<Category> {
    await delay();
    const trimmedName = data.name.trim();
    const duplicate = categoriesState.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('Já existe uma categoria com este nome');
    }
    const maxSortOrder = categoriesState.length > 0
      ? Math.max(...categoriesState.map((c) => c.sortOrder))
      : -1;
    const newCategory: Category = {
      id: generateId(),
      name: trimmedName,
      sortOrder: maxSortOrder + 1,
      status: 'ativo',
      itemCount: 0,
      createdAt: now(),
    };
    categoriesState.push(newCategory);
    return newCategory;
  },

  async updateCategory(id: string, data: UpdateCategoryRequest): Promise<Category> {
    await delay();
    const index = categoriesState.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error('Categoria não encontrada');
    }
    const trimmedName = data.name.trim();
    const duplicate = categoriesState.find(
      (c) => c.id !== id && c.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('Já existe uma categoria com este nome');
    }
    const updated: Category = { ...categoriesState[index]!, name: trimmedName };
    categoriesState[index] = updated;
    return updated;
  },

  async reorderCategories(data: ReorderCategoriesRequest): Promise<Category[]> {
    await delay();
    const reordered = data.categoryIds.map((id, index) => {
      const cat = categoriesState.find((c) => c.id === id);
      if (!cat) throw new Error('Categoria não encontrada na lista');
      return { ...cat, sortOrder: index };
    });
    categoriesState = reordered;
    return [...categoriesState];
  },

  async toggleCategoryStatus(id: string, action: 'activate' | 'deactivate'): Promise<Category> {
    await delay();
    const index = categoriesState.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error('Categoria não encontrada');
    }
    const category = categoriesState[index]!;
    const newStatus = action === 'activate' ? 'ativo' : 'inativo';
    const updated: Category = { ...category, status: newStatus };
    categoriesState[index] = updated;
    return updated;
  },

  async deleteCategory(id: string): Promise<void> {
    await delay();
    const index = categoriesState.findIndex((c) => c.id === id);
    if (index === -1) {
      throw new Error('Categoria não encontrada');
    }
    categoriesState.splice(index, 1);
  },
};
