import type {
  MenuItem,
  MenuItemStatus,
  CreateMenuItemRequest,
  UpdateMenuItemRequest,
  Order,
  OrderStatus,
  OrderOrigin,
  PaymentStatus,
  PaymentMethod,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  UpdateOrderItemsRequest,
  RegisterPaymentRequest,
  DailySummary,
  MonthlySummaryResponse,
  MonthlyHeatmapResponse,
  Category,
  CategoryStatus,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoriesRequest,
} from '@order-system/shared';
import type { ApiClient } from './types';
import { tokenStorage } from './token-storage';
import { authEvents } from './auth-events';
import {
  asRecord,
  asRecordArray,
  pickNumber,
  pickOptionalNumber,
  pickOptionalString,
  pickString,
  type RawRecord,
} from './api-parsing';

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
 * Mapeia um registro cru de item de menu (camelCase ou snake_case) para
 * `MenuItem`. Aceita a `category` do grupo como fallback (usado no formato
 * agrupado). O `status` vem do backend, a autoridade final do domínio.
 */
function mapMenuItemRecord(raw: RawRecord, groupCategory?: string): MenuItem {
  return {
    id: pickString(raw, 'id'),
    name: pickString(raw, 'name'),
    price: pickNumber(raw, ['price_cents', 'priceCents', 'price']),
    category: pickString(raw, 'category') || (groupCategory ?? ''),
    status: pickString(raw, 'status') as MenuItemStatus,
    createdAt: pickString(raw, 'createdAt', 'created_at'),
    updatedAt: pickString(raw, 'updatedAt', 'updated_at'),
  };
}

/**
 * Achata a resposta agrupada do menu (`[{ category, items }]`) em uma lista
 * plana de `MenuItem`.
 */
function flattenMenuResponse(grouped: RawRecord[]): MenuItem[] {
  const result: MenuItem[] = [];
  for (const group of grouped) {
    const groupCategory = pickString(group, 'category');
    for (const item of asRecordArray(group.items)) {
      result.push(mapMenuItemRecord(item, groupCategory));
    }
  }
  return result;
}

/**
 * Mapeia a resposta crua de pedido para a interface compartilhada `Order`,
 * tolerando camelCase e snake_case. Os campos de union (`origin`, `status`,
 * `paymentStatus`, `paymentMethod`) vêm validados pelo backend.
 */
function mapOrder(value: unknown): Order {
  const raw = asRecord(value);
  const paymentMethod = pickOptionalString(raw, 'paymentMethod', 'payment_method');
  return {
    id: pickString(raw, 'id'),
    dailyNumber: pickNumber(raw, ['dailyNumber', 'daily_number']),
    customerName: pickString(raw, 'customerName', 'customer_name'),
    origin: pickString(raw, 'origin') as OrderOrigin,
    status: pickString(raw, 'status') as OrderStatus,
    paymentStatus: pickString(raw, 'paymentStatus', 'payment_status') as PaymentStatus,
    paymentMethod: paymentMethod as PaymentMethod | undefined,
    items: asRecordArray(raw.items).map((i) => ({
      menuItemId: pickString(i, 'menuItemId', 'menu_item_id'),
      name: pickString(i, 'itemName', 'item_name', 'name'),
      quantity: pickNumber(i, ['quantity']),
      unitPrice: pickNumber(i, ['unitPriceCents', 'unit_price_cents', 'unitPrice']),
    })),
    totalAmount: pickNumber(raw, ['totalAmountCents', 'total_amount_cents', 'totalAmount']),
    createdAt: pickString(raw, 'createdAt', 'created_at'),
    startedAt: pickOptionalString(raw, 'startedAt', 'started_at'),
    readyAt: pickOptionalString(raw, 'readyAt', 'ready_at'),
    deliveredAt: pickOptionalString(raw, 'deliveredAt', 'delivered_at'),
    paidAt: pickOptionalString(raw, 'paidAt', 'paid_at'),
    latitude: pickOptionalNumber(raw, 'latitude'),
    longitude: pickOptionalNumber(raw, 'longitude'),
  };
}

/**
 * Mapeia a resposta crua de um item de menu individual para `MenuItem`.
 */
function mapMenuItem(value: unknown): MenuItem {
  return mapMenuItemRecord(asRecord(value));
}

/**
 * Interpreta a resposta do menu, que vem em um de dois formatos:
 * - agrupada por categoria (`[{ category, items }]`) — o formato padrão;
 * - já plana (`[MenuItem, ...]`) — fallback.
 * Detecta o formato agrupado pela presença de `items` no primeiro elemento.
 */
function parseMenuResponse(value: unknown): MenuItem[] {
  const list = asRecordArray(value);
  const first = list[0];
  const isGrouped = first !== undefined && 'items' in first;
  if (isGrouped) {
    return flattenMenuResponse(list);
  }
  return list.map((item) => mapMenuItemRecord(item));
}

/**
 * Mapeia a resposta crua de categoria para a interface compartilhada `Category`.
 */
function mapCategory(value: unknown): Category {
  const raw = asRecord(value);
  return {
    id: pickString(raw, 'id'),
    name: pickString(raw, 'name'),
    sortOrder: pickNumber(raw, ['sortOrder', 'sort_order']),
    status: pickString(raw, 'status') as CategoryStatus,
    itemCount: pickNumber(raw, ['itemCount', 'item_count']),
    createdAt: pickString(raw, 'createdAt', 'created_at'),
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

  async requestPasswordReset(email: string): Promise<void> {
    // Fluxo não autenticado: usa fetch direto (não authFetch). A resposta do
    // backend é sempre neutra (Mensagem_Neutra), então não diferenciamos
    // sucesso/erro de negócio aqui — apenas tratamos falha de conexão, como no login.
    try {
      await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // fetch só lança quando a requisição não chega ao servidor (offline,
      // host/porta inacessível, DNS, etc.). status 0 sinaliza falha de conexão.
      throw new NetworkError(
        'Não foi possível conectar ao servidor. Verifique sua conexão e o endereço da API.',
        0,
      );
    }
  },

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    // Fluxo não autenticado: usa fetch direto (não authFetch).
    let response: Response;
    try {
      response = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
    } catch {
      throw new NetworkError(
        'Não foi possível conectar ao servidor. Verifique sua conexão e o endereço da API.',
        0,
      );
    }

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // Mensagem em pt-BR vinda do backend (ex.: "Código inválido ou expirado").
      throw new NetworkError(body.message || `Erro ${response.status}`, response.status);
    }
  },

  async getMenu(): Promise<MenuItem[]> {
    const response = await authFetch('/api/menu');
    const data: unknown = await response.json();
    return parseMenuResponse(data);
  },

  async getAllMenuItems(): Promise<MenuItem[]> {
    const response = await authFetch('/api/menu?all=true');
    const data: unknown = await response.json();
    return parseMenuResponse(data);
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
    const data: unknown = await response.json();
    // A rota pode responder um array direto ou `{ orders: [...] }`.
    const rawOrders = Array.isArray(data) ? data : asRecord(data).orders;
    const orders: Order[] = asRecordArray(rawOrders).map(mapOrder);

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
        'cartão débito': 0,
        'cartão crédito': 0,
      },
    };
  },

  async getMonthlySummary(year: number, month: number): Promise<MonthlySummaryResponse> {
    const response = await authFetch(`/api/summary/monthly?year=${year}&month=${month}`);
    return response.json();
  },

  async getMonthlyHeatmap(year: number, month: number): Promise<MonthlyHeatmapResponse> {
    const response = await authFetch(`/api/summary/monthly/heatmap?year=${year}&month=${month}`);
    const raw = asRecord(await response.json());
    return {
      year: pickNumber(raw, ['year'], year),
      month: pickNumber(raw, ['month'], month),
      totalOrders: pickNumber(raw, ['totalOrders', 'total_orders']),
      geolocatedOrders: pickNumber(raw, ['geolocatedOrders', 'geolocated_orders']),
      points: asRecordArray(raw.points).map((p) => ({
        latitude: pickNumber(p, ['latitude', 'lat']),
        longitude: pickNumber(p, ['longitude', 'lng']),
        weight: pickNumber(p, ['weight'], 1),
      })),
    };
  },

  async getCategories(): Promise<Category[]> {
    const response = await authFetch('/api/categories');
    const data: unknown = await response.json();
    return asRecordArray(data).map(mapCategory);
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
    const rawList: unknown = await response.json();
    return asRecordArray(rawList).map(mapCategory);
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
