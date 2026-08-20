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
import type { ApiClient } from './types';
import { tokenStorage } from './token-storage';
import { authEvents } from './auth-events';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

/** Flag to prevent multiple simultaneous refresh attempts. */
let isRefreshing = false;
/** Queue of requests waiting for refresh to complete. */
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: Error) => void }> = [];

/**
 * Attempts to refresh the access token using the stored refresh token.
 * Returns the new access token on success, or null if refresh fails.
 */
async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    await tokenStorage.setTokens(data.accessToken, data.refreshToken, data.expiresIn);
    return data.accessToken;
  } catch {
    return null;
  }
}

/**
 * Handles token refresh with queuing to prevent multiple concurrent refresh calls.
 */
async function handleTokenRefresh(): Promise<string | null> {
  if (isRefreshing) {
    // Wait for the ongoing refresh to complete
    return new Promise((resolve, reject) => {
      refreshQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;
  try {
    const newToken = await tryRefreshToken();
    if (newToken) {
      // Resolve all queued requests with the new token
      refreshQueue.forEach(({ resolve }) => resolve(newToken));
    } else {
      // Reject all queued requests
      refreshQueue.forEach(({ reject }) => reject(new Error('Refresh failed')));
    }
    refreshQueue = [];
    return newToken;
  } finally {
    isRefreshing = false;
  }
}

/**
 * Performs an authenticated fetch request with automatic token handling.
 * On 401, attempts to refresh the token before failing.
 */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  let token = await tokenStorage.getAccessToken();

  // If token expired locally, try refreshing before giving up
  if (!token) {
    const newToken = await handleTokenRefresh();
    if (!newToken) {
      await tokenStorage.clear();
      authEvents.emitSessionExpired();
      throw new NetworkError('Sessão expirada. Faça login novamente.', 401);
    }
    token = newToken;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
    'Authorization': `Bearer ${token}`,
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Token rejected by server — attempt refresh
    const newToken = await handleTokenRefresh();
    if (newToken) {
      // Retry the original request with the new token
      const retryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> || {}),
        'Authorization': `Bearer ${newToken}`,
      };
      const retryResponse = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: retryHeaders,
      });
      if (retryResponse.status === 401) {
        // Refresh token also invalid — session truly expired
        await tokenStorage.clear();
        authEvents.emitSessionExpired();
        throw new NetworkError('Sessão expirada. Faça login novamente.', 401);
      }
      if (!retryResponse.ok) {
        const body = await retryResponse.json().catch(() => ({}));
        throw new NetworkError(body.message || `Erro ${retryResponse.status}`, retryResponse.status);
      }
      return retryResponse;
    }

    // Refresh failed — session expired
    await tokenStorage.clear();
    authEvents.emitSessionExpired();
    throw new NetworkError('Sessão expirada. Faça login novamente.', 401);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new NetworkError(
      body.message || `Erro ${response.status}`,
      response.status,
    );
  }

  return response;
}

/**
 * Custom error class for network/API errors.
 */
export class NetworkError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Maps backend menu response (grouped by category) to flat MenuItem array.
 */
function flattenMenuResponse(grouped: { category: string; items: any[] }[]): MenuItem[] {
  const result: MenuItem[] = [];
  for (const group of grouped) {
    for (const item of group.items) {
      result.push({
        id: item.id,
        name: item.name,
        price: item.price_cents ?? item.priceCents ?? item.price,
        category: item.category ?? group.category,
        status: item.status,
        createdAt: item.createdAt ?? item.created_at,
        updatedAt: item.updatedAt ?? item.updated_at,
      });
    }
  }
  return result;
}

/**
 * Maps backend order response to the shared Order interface.
 */
function mapOrder(raw: any): Order {
  return {
    id: raw.id,
    dailyNumber: raw.dailyNumber ?? raw.daily_number,
    customerName: raw.customerName ?? raw.customer_name,
    origin: raw.origin,
    status: raw.status,
    paymentStatus: raw.paymentStatus ?? raw.payment_status,
    paymentMethod: raw.paymentMethod ?? raw.payment_method ?? undefined,
    items: (raw.items || []).map((i: any) => ({
      menuItemId: i.menuItemId ?? i.menu_item_id,
      name: i.itemName ?? i.item_name ?? i.name,
      quantity: i.quantity,
      unitPrice: i.unitPriceCents ?? i.unit_price_cents ?? i.unitPrice,
    })),
    totalAmount: raw.totalAmountCents ?? raw.total_amount_cents ?? raw.totalAmount,
    createdAt: raw.createdAt ?? raw.created_at,
    startedAt: raw.startedAt ?? raw.started_at ?? undefined,
    readyAt: raw.readyAt ?? raw.ready_at ?? undefined,
    deliveredAt: raw.deliveredAt ?? raw.delivered_at ?? undefined,
    paidAt: raw.paidAt ?? raw.paid_at ?? undefined,
  };
}

/**
 * Maps a single backend menu item response to the shared MenuItem interface.
 */
function mapMenuItem(raw: any): MenuItem {
  return {
    id: raw.id,
    name: raw.name,
    price: raw.price_cents ?? raw.priceCents ?? raw.price,
    category: raw.category,
    status: raw.status,
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

/**
 * Maps a backend category response to the shared Category interface.
 */
function mapCategory(raw: any): Category {
  return {
    id: raw.id,
    name: raw.name,
    sortOrder: raw.sortOrder ?? raw.sort_order,
    status: raw.status,
    itemCount: raw.itemCount ?? raw.item_count ?? 0,
    createdAt: raw.createdAt ?? raw.created_at,
  };
}

export const realClient: ApiClient = {
  async login(email: string, password: string): Promise<{ token: string }> {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      // fetch só lança quando a requisição não chega ao servidor (offline,
      // host/porta inacessível, DNS, etc.). Aqui NÃO é erro de credenciais —
      // status 0 sinaliza falha de conexão para a UI diferenciar a mensagem.
      throw new NetworkError(
        'Não foi possível conectar ao servidor. Verifique sua conexão e o endereço da API.',
        0,
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // 401 → credenciais inválidas; demais status → mensagem do backend ou genérica.
      const fallback =
        response.status === 401
          ? 'E-mail ou senha incorretos'
          : `Erro ao entrar (${response.status}). Tente novamente.`;
      throw new NetworkError(body.message || fallback, response.status);
    }

    const data = await response.json();
    // Store tokens
    await tokenStorage.setTokens(data.accessToken, data.refreshToken, data.expiresIn);

    return { token: data.accessToken };
  },

  async logout(): Promise<void> {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      await tokenStorage.clear();
    }
  },

  async getMenu(): Promise<MenuItem[]> {
    const response = await authFetch('/api/menu');
    const data = await response.json();
    // Backend returns grouped format: [{category, items}]
    if (Array.isArray(data) && data.length > 0 && data[0].items) {
      return flattenMenuResponse(data);
    }
    // Fallback: already flat
    return (data as any[]).map(mapMenuItem);
  },

  async getAllMenuItems(): Promise<MenuItem[]> {
    const response = await authFetch('/api/menu?all=true');
    const data = await response.json();
    // Backend returns grouped format: [{category, items}]
    if (Array.isArray(data) && data.length > 0 && data[0].items) {
      return flattenMenuResponse(data);
    }
    return (data as any[]).map(mapMenuItem);
  },

  async createMenuItem(data: CreateMenuItemRequest): Promise<MenuItem> {
    const response = await authFetch('/api/menu', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapMenuItem(raw);
  },

  async updateMenuItem(id: string, data: UpdateMenuItemRequest): Promise<MenuItem> {
    const response = await authFetch(`/api/menu/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapMenuItem(raw);
  },

  async toggleMenuItemStatus(id: string): Promise<MenuItem> {
    const response = await authFetch(`/api/menu/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
    const raw = await response.json();
    return mapMenuItem(raw);
  },

  async deleteMenuItem(id: string): Promise<void> {
    await authFetch(`/api/menu/${id}`, {
      method: 'DELETE',
    });
  },

  async getOrders(filter?: { status?: OrderStatus[]; date?: string }): Promise<Order[]> {
    let url = '/api/orders';
    const params = new URLSearchParams();
    if (filter?.status && filter.status.length > 0) {
      params.set('status', filter.status.join(','));
    }
    if (filter?.date) {
      params.set('date', filter.date);
    }
    const query = params.toString();
    if (query) url += `?${query}`;
    const response = await authFetch(url);
    const data = await response.json();
    const orders: Order[] = (Array.isArray(data) ? data : data.orders || []).map(mapOrder);

    // Sort delivered orders by deliveredAt descending, others by createdAt ascending
    if (filter?.status?.includes('entregue') && filter.status.length === 1) {
      return orders.sort((a: Order, b: Order) => {
        const aTime = a.deliveredAt ? new Date(a.deliveredAt).getTime() : 0;
        const bTime = b.deliveredAt ? new Date(b.deliveredAt).getTime() : 0;
        return bTime - aTime;
      });
    }

    return orders.sort(
      (a: Order, b: Order) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  },

  async getOrderById(id: string): Promise<Order> {
    const response = await authFetch(`/api/orders/${id}`);
    const raw = await response.json();
    return mapOrder(raw);
  },

  async createOrder(data: CreateOrderRequest): Promise<Order> {
    const response = await authFetch('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapOrder(raw);
  },

  async updateOrderStatus(id: string, data: UpdateOrderStatusRequest): Promise<Order> {
    const response = await authFetch(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapOrder(raw);
  },

  async updateOrderItems(orderId: string, data: UpdateOrderItemsRequest): Promise<Order> {
    const response = await authFetch(`/api/orders/${orderId}/items`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapOrder(raw);
  },

  async deleteOrder(id: string): Promise<void> {
    await authFetch(`/api/orders/${id}`, { method: 'DELETE' });
  },

  async registerPayment(id: string, data: RegisterPaymentRequest): Promise<Order> {
    const response = await authFetch(`/api/orders/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapOrder(raw);
  },

  async getDailySummary(date?: string): Promise<DailySummary> {
    const url = date ? `/api/summary/today?date=${date}` : '/api/summary/today';
    const response = await authFetch(url);
    const raw = await response.json();
    return {
      date: raw.date,
      totalOrders: raw.totalOrders ?? raw.total_orders,
      paidOrders: raw.paidOrders ?? raw.paid_orders,
      pendingOrders: raw.pendingOrders ?? raw.pending_orders,
      paidTotal: raw.paidTotal ?? raw.paid_total,
      pendingTotal: raw.pendingTotal ?? raw.pending_total,
      byPaymentMethod: raw.byPaymentMethod ?? raw.by_payment_method ?? {
        dinheiro: 0,
        pix: 0,
        'cartão': 0,
      },
    };
  },

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummaryResponse> {
    const response = await authFetch(`/api/summary/monthly?year=${year}&month=${month}`);
    return response.json();
  },

  async getCategories(): Promise<Category[]> {
    const response = await authFetch('/api/categories');
    const data = await response.json();
    return (data as any[]).map(mapCategory);
  },

  async createCategory(data: CreateCategoryRequest): Promise<Category> {
    const response = await authFetch('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapCategory(raw);
  },

  async updateCategory(id: string, data: UpdateCategoryRequest): Promise<Category> {
    const response = await authFetch(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapCategory(raw);
  },

  async reorderCategories(data: ReorderCategoriesRequest): Promise<Category[]> {
    const response = await authFetch('/api/categories/reorder', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const rawList = await response.json();
    return (rawList as any[]).map(mapCategory);
  },

  async toggleCategoryStatus(id: string, action: 'activate' | 'deactivate'): Promise<Category> {
    const response = await authFetch(`/api/categories/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ action }),
    });
    const raw = await response.json();
    return mapCategory(raw);
  },

  async deleteCategory(id: string): Promise<void> {
    await authFetch(`/api/categories/${id}`, {
      method: 'DELETE',
    });
  },

  // ─── Users ────────────────────────────────────────────────────────────────

  async listUsers(filters?) {
    const params = new URLSearchParams();
    if (filters?.role) params.set('role', filters.role);
    if (filters?.status) params.set('status', filters.status);
    const query = params.toString();
    const path = query ? `/api/users?${query}` : '/api/users';
    const response = await authFetch(path);
    return response.json();
  },

  async getUserById(id: string) {
    const response = await authFetch(`/api/users/${id}`);
    return response.json();
  },

  async createUser(data) {
    const response = await authFetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateUser(id: string, data) {
    const response = await authFetch(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async toggleUserStatus(id: string, status) {
    const response = await authFetch(`/api/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    return response.json();
  },

  async deleteUser(id: string) {
    await authFetch(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  async resetPassword(id: string, password: string) {
    await authFetch(`/api/users/${id}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password }),
    });
  },
};
