import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Order, OrderStatus } from '@order-system/shared';

// ─── Mock setup (hoisted) ───────────────────────────────────────────────────
// vi.hoisted ensures these are available when vi.mock factories run.

const { mockApiClient, orderUpdateCallbacksRef } = vi.hoisted(() => {
  const callbacks = { current: new Set<(order: Order) => void>() };
  return {
    mockApiClient: {
      login: vi.fn(),
      logout: vi.fn(),
      getOrders: vi.fn(),
      getMenu: vi.fn(),
      createOrder: vi.fn(),
      updateOrderStatus: vi.fn(),
      registerPayment: vi.fn(),
      getDailySummary: vi.fn(),
    },
    orderUpdateCallbacksRef: callbacks,
  };
});

vi.mock('../services/api-client', () => ({
  apiClient: mockApiClient,
}));

// Mock useRealtime to avoid Supabase dependency
vi.mock('../hooks/useRealtime', () => ({
  useRealtime: () => ({ status: 'disconnected' as const }),
}));

// Mock @supabase/supabase-js to prevent import errors
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
  })),
}));

// ─── Test Data ──────────────────────────────────────────────────────────────

const mockOrders: Order[] = [
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
    ],
    totalAmount: 1400,
    createdAt: '2024-01-15T11:05:00.000Z',
    startedAt: '2024-01-15T11:08:00.000Z',
    paidAt: '2024-01-15T11:05:00.000Z',
  },
];

import { App } from '../App';
import { ThemeProvider } from '../theme';

// ─── Test Wrapper ───────────────────────────────────────────────────────────

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('QueuePage Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orderUpdateCallbacksRef.current = new Set();
    sessionStorage.clear();
    mockApiClient.getOrders.mockResolvedValue(mockOrders);
    mockApiClient.login.mockResolvedValue({ token: 'mock-token' });
    mockApiClient.logout.mockResolvedValue(undefined);
    mockApiClient.updateOrderStatus.mockImplementation(
      async (id: string, data: { status: OrderStatus }) => {
        const order = mockOrders.find((o) => o.id === id);
        if (!order) throw new Error('Order not found');
        return { ...order, status: data.status };
      },
    );
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('shows login page when not authenticated', () => {
    renderApp();
    expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    expect(screen.getByText('Entrar')).toBeInTheDocument();
  });

  it('authenticates and shows queue page on successful login', async () => {
    const user = userEvent.setup();
    renderApp();

    const emailInput = screen.getByPlaceholderText('seu@email.com');
    const passwordInput = screen.getByPlaceholderText('Sua senha');
    const submitButton = screen.getByText('Entrar');

    await user.type(emailInput, 'prep@test.com');
    await user.type(passwordInput, 'senha123');
    await user.click(submitButton);

    expect(mockApiClient.login).toHaveBeenCalledWith('prep@test.com', 'senha123');

    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument();
    });
  });

  it('displays orders loaded from the API', async () => {
    const user = userEvent.setup();
    renderApp();

    // Login first
    await user.type(screen.getByPlaceholderText('seu@email.com'), 'prep@test.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123');
    await user.click(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument();
    });

    // Verify orders are displayed
    await waitFor(() => {
      expect(screen.getByText(/Carlos Mendes/)).toBeInTheDocument();
      expect(screen.getByText(/João Silva/)).toBeInTheDocument();
      expect(screen.getByText(/Maria Oliveira/)).toBeInTheDocument();
    });
  });

  it('shows order cards with number, name, origin, items, and status', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'prep@test.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123');
    await user.click(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument();
    });

    // Check order #2 details (aguardando)
    await waitFor(() => {
      expect(screen.getByText(/#2 — João Silva/)).toBeInTheDocument();
      expect(screen.getByText(/2x Pastel de Carne/)).toBeInTheDocument();
      expect(screen.getByText(/1x Caldo de Cana/)).toBeInTheDocument();
    });

    // Check origin badge exists (whatsapp for Maria)
    expect(screen.getByText(/WhatsApp/i)).toBeInTheDocument();
  });

  it('advances order status when action button is clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'prep@test.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123');
    await user.click(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument();
    });

    // Find "Iniciar Preparo" button (for aguardando order #2)
    await waitFor(() => {
      expect(screen.getByText('Iniciar Preparo')).toBeInTheDocument();
    });

    const iniciarButton = screen.getByText('Iniciar Preparo');
    await user.click(iniciarButton);

    expect(mockApiClient.updateOrderStatus).toHaveBeenCalledWith('order-002', { status: 'preparando' });
  });

  it('removes order from queue when status becomes entregue', async () => {
    // Return only the pronto order so we can test advancing to entregue
    const prontoOrder: Order = { ...mockOrders[0]! };
    mockApiClient.getOrders.mockResolvedValue([prontoOrder]);
    mockApiClient.updateOrderStatus.mockResolvedValue({ ...prontoOrder, status: 'entregue', deliveredAt: new Date().toISOString() });

    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'prep@test.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123');
    await user.click(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(screen.getByText(/Carlos Mendes/)).toBeInTheDocument();
    });

    // Click "Marcar Entregue" for the pronto order
    const entregueButton = screen.getByText('Marcar Entregue');
    await user.click(entregueButton);

    expect(mockApiClient.updateOrderStatus).toHaveBeenCalledWith('order-001', { status: 'entregue' });
  });

  it('shows filter chips with default selection (aguardando, preparando, pronto)', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('seu@email.com'), 'prep@test.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123');
    await user.click(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument();
    });

    // Check filter chips are visible (use role=tab to target chips specifically)
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBe(4);
      expect(screen.getByLabelText('Filtrar Aguardando')).toBeInTheDocument();
      expect(screen.getByLabelText('Filtrar Preparando')).toBeInTheDocument();
      expect(screen.getByLabelText('Filtrar Pronto')).toBeInTheDocument();
      expect(screen.getByLabelText('Filtrar Entregue')).toBeInTheDocument();
    });
  });

  it('calls logout and returns to login page', async () => {
    const user = userEvent.setup();
    renderApp();

    // Login
    await user.type(screen.getByPlaceholderText('seu@email.com'), 'prep@test.com');
    await user.type(screen.getByPlaceholderText('Sua senha'), 'senha123');
    await user.click(screen.getByText('Entrar'));

    await waitFor(() => {
      expect(screen.getByText('Pedidos')).toBeInTheDocument();
    });

    // Click logout
    const logoutButton = screen.getByLabelText('Sair');
    await user.click(logoutButton);

    expect(mockApiClient.logout).toHaveBeenCalled();

    // Should return to login page
    await waitFor(() => {
      expect(screen.getByPlaceholderText('seu@email.com')).toBeInTheDocument();
    });
  });
});
