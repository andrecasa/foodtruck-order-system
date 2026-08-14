import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaymentScreen } from '../../screens/PaymentScreen';
import type { Order } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

jest.mock('../../services/api-client', () => ({
  apiClient: {
    registerPayment: jest.fn(),
  },
}));

// Mock DrawerMenu to avoid AuthProvider dependency
jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

// Mock PrototypeBanner to avoid env-related issues
jest.mock('../../components/PrototypeBanner', () => ({
  PrototypeBanner: () => null,
}));

const mockTheme = {
  colors: {
    primary: '#7B2D2D',
    secondary: '#D4812B',
    background: '#FDF8F4',
    text: '#3D2020',
    success: '#5A8C5A',
    warning: '#D4812B',
    error: '#B54040',
    textSecondary: '#8B6B5A',
    surface: '#FFFFFF',
    divider: '#E8DDD5',
  },
  typography: {
    fontFamily: 'Inter',
    sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 32 },
    weights: { regular: 400, medium: 500, bold: 600 },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 8, md: 12, lg: 24, full: 9999 },
  businessName: 'Pastel das Meninas',
  logo: '',
};

jest.mock('../../theme', () => ({
  useTheme: () => mockTheme,
  ThemeProvider: ({ children }: any) => children,
  defaultTheme: mockTheme,
  loadTheme: () => mockTheme,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => mockTheme,
  ThemeProvider: ({ children }: any) => children,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-123',
    dailyNumber: 5,
    customerName: 'Maria Silva',
    origin: 'presencial',
    status: 'aguardando',
    paymentStatus: 'pendente',
    paymentMethod: null,
    totalAmount: 2500,
    orderDate: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    startedAt: null,
    readyAt: null,
    deliveredAt: null,
    paidAt: null,
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-item-1',
        name: 'Pastel de Carne',
        unitPrice: 800,
        quantity: 2,
      },
      {
        id: 'item-2',
        menuItemId: 'menu-item-2',
        name: 'Caldo de Cana',
        unitPrice: 900,
        quantity: 1,
      },
    ],
    ...overrides,
  } as Order;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PaymentScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Button visibility', () => {
    /**
     * Validates: Requirements 2.1
     * WHILE the order has paymentStatus 'pendente', the button "Adicionar Item"
     * SHALL be rendered visible and enabled.
     */
    it('renders "+ Adicionar Item" button when paymentStatus is pendente', () => {
      const order = createOrder({ paymentStatus: 'pendente' });
      const { getByTestId } = render(<PaymentScreen order={order} />);

      const addButton = getByTestId('add-items-button-main');
      expect(addButton).toBeTruthy();
    });

    /**
     * Validates: Requirements 2.2
     * WHILE the order has paymentStatus 'pago', the button "Adicionar Item"
     * SHALL be hidden completely (not rendered).
     */
    it('hides "+ Adicionar Item" button when paymentStatus is pago', () => {
      const order = createOrder({ paymentStatus: 'pago' });
      const { queryByTestId } = render(<PaymentScreen order={order} />);

      const addButton = queryByTestId('add-items-button-main');
      expect(addButton).toBeNull();
    });
  });

  describe('Navigation', () => {
    /**
     * Validates: Requirements 3.1
     * WHEN the user presses "Adicionar Item", the app SHALL navigate to
     * EditOrderItemsScreen passing the orderId as a navigation parameter.
     */
    it('navigates to edit-order-items with orderId when button pressed', () => {
      const order = createOrder({ paymentStatus: 'pendente' });
      const { getByTestId } = render(<PaymentScreen order={order} />);

      const addButton = getByTestId('add-items-button-main');
      fireEvent.press(addButton);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/edit-order-items',
        params: { orderId: 'order-123' },
      });
    });
  });
});
