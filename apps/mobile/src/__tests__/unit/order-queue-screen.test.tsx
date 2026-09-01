import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { OrderQueueScreen } from '../../screens/OrderQueueScreen';
import type { Order } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

jest.mock('../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOffline: false }),
}));

jest.mock('../../hooks/useNetworkError', () => ({
  useNetworkError: () => ({
    error: { message: '', visible: false },
    dismiss: jest.fn(),
    withRetry: (fn: () => Promise<any>) => fn(),
  }),
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@test.com', role: 'admin' },
    tenantId: '11111111-1111-4111-8111-111111111111',
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const mockGetOrders = jest.fn<Promise<Order[]>, any[]>();
const mockUpdateOrderStatus = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getOrders: (...args: any[]) => mockGetOrders(...args),
    updateOrderStatus: (...args: any[]) => mockUpdateOrderStatus(...args),
  },
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

jest.mock('../../components/BottomNav', () => ({
  BottomNav: () => null,
}));

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

function createOrders(): Order[] {
  return [
    {
      id: 'order-1',
      dailyNumber: 1,
      customerName: 'Maria',
      origin: 'presencial',
      status: 'aguardando',
      paymentStatus: 'pendente',
      totalAmount: 1600,
      createdAt: new Date().toISOString(),
      items: [
        { menuItemId: 'm1', name: 'Pastel de Carne', unitPrice: 800, quantity: 2 },
      ],
    },
    {
      id: 'order-2',
      dailyNumber: 2,
      customerName: 'João',
      origin: 'whatsapp',
      status: 'preparando',
      paymentStatus: 'pago',
      paymentMethod: 'pix',
      totalAmount: 900,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      items: [
        { menuItemId: 'm2', name: 'Caldo de Cana', unitPrice: 900, quantity: 1 },
      ],
    },
    {
      id: 'order-3',
      dailyNumber: 3,
      customerName: 'Ana',
      origin: 'web',
      status: 'aguardando',
      paymentStatus: 'pendente',
      totalAmount: 1000,
      createdAt: new Date().toISOString(),
      items: [
        { menuItemId: 'm3', name: 'Pastel de Frango', unitPrice: 1000, quantity: 1 },
      ],
    },
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('OrderQueueScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders order list', async () => {
    mockGetOrders.mockResolvedValue(createOrders());

    const { findByText } = render(<OrderQueueScreen />);

    await findByText('#1 - Maria');
    await findByText('#2 - João');
  });

  it('renders the origin badge per origin (web = QrCode)', async () => {
    mockGetOrders.mockResolvedValue(createOrders());

    const { findByText, getByText } = render(<OrderQueueScreen />);

    // web orders show as "QrCode" (matches the customer card and PaymentScreen).
    await findByText('QrCode');
    expect(getByText('WhatsApp')).toBeTruthy();
    expect(getByText('Presencial')).toBeTruthy();
  });

  it('shows filter chips for status', async () => {
    mockGetOrders.mockResolvedValue(createOrders());

    const { findByTestId } = render(<OrderQueueScreen />);

    // FilterChips component renders with testID="status-filter"
    const filterRow = await findByTestId('status-filter');
    expect(filterRow).toBeTruthy();
  });

  it('advances order status on button press', async () => {
    mockGetOrders.mockResolvedValue(createOrders());
    mockUpdateOrderStatus.mockResolvedValue(undefined);

    const { findByTestId } = render(<OrderQueueScreen />);

    // Press advance button for order-1 (aguardando → preparando)
    const advanceBtn = await findByTestId('advance-order-1');
    fireEvent.press(advanceBtn);

    await waitFor(() => {
      expect(mockUpdateOrderStatus).toHaveBeenCalledWith('order-1', { status: 'preparando' });
    });
  });
});
