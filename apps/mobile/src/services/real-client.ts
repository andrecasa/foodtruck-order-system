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
import { tokenStorage } from './token-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

/**
 * Performs an authenticated fetch request with automatic token handling.
 * Throws an error with status code info on non-2xx responses.
 */
async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await tokenStorage.getAccessToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Token expired or invalid — clear stored tokens
    await tokenStorage.clear();
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

export const realClient: ApiClient = {
  async login(email: string, password: string): Promise<{ token: string }> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new NetworkError(
        body.message || 'E-mail ou senha incorretos',
        response.status,
      );
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

  async getOrders(filter?: { status?: OrderStatus[] }): Promise<Order[]> {
    let url = '/api/orders';
    if (filter?.status && filter.status.length > 0) {
      const params = new URLSearchParams();
      params.set('status', filter.status.join(','));
      url += `?${params.toString()}`;
    }
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

  async registerPayment(id: string, data: RegisterPaymentRequest): Promise<Order> {
    const response = await authFetch(`/api/orders/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const raw = await response.json();
    return mapOrder(raw);
  },

  async getDailySummary(): Promise<DailySummary> {
    const response = await authFetch('/api/summary/today');
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
};
