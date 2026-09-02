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

import { mockTheme } from '../helpers/mockTheme';

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

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
     * WHILE the order has paymentStatus 'pendente', the order card SHALL be
     * tappable (enabled) to edit the order (replaces the old "+ Adicionar" button).
     */
    it('renders a tappable order card when paymentStatus is pendente', () => {
      const order = createOrder({ paymentStatus: 'pendente' });
      const { getByTestId } = render(<PaymentScreen order={order} />);

      const card = getByTestId('order-card');
      expect(card).toBeTruthy();
      expect(card.props.accessibilityState?.disabled).toBeFalsy();
    });

    /**
     * Validates: Requirements 2.2
     * WHILE the order has paymentStatus 'pago', the order card SHALL be
     * disabled (not tappable / no navigation).
     */
    it('renders a disabled order card when paymentStatus is pago', () => {
      const order = createOrder({ paymentStatus: 'pago' });
      const { getByTestId } = render(<PaymentScreen order={order} />);

      const card = getByTestId('order-card');
      expect(card).toBeTruthy();
      expect(card.props.accessibilityState?.disabled).toBe(true);
    });
  });

  describe('Navigation', () => {
    /**
     * Validates: Requirements 3.1
     * WHEN the user taps the order card (pendente), the app SHALL navigate to
     * EditOrderItemsScreen passing the orderId as a navigation parameter.
     */
    it('navigates to edit-order-items with orderId when card pressed', () => {
      const order = createOrder({ paymentStatus: 'pendente' });
      const { getByTestId } = render(<PaymentScreen order={order} />);

      const card = getByTestId('order-card');
      fireEvent.press(card);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(tabs)/edit-order-items',
        params: { orderId: 'order-123' },
      });
    });

    /**
     * WHEN the order is already paid, tapping the card SHALL NOT navigate.
     */
    it('does not navigate when a paid order card is pressed', () => {
      const order = createOrder({ paymentStatus: 'pago' });
      const { getByTestId } = render(<PaymentScreen order={order} />);

      fireEvent.press(getByTestId('order-card'));

      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
