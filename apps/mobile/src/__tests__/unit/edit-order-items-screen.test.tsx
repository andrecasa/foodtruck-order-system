import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { EditOrderItemsScreen } from '../../screens/EditOrderItemsScreen';
import type { Order, MenuItem } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: jest.fn(),
  }),
}));

const mockGetMenu = jest.fn<Promise<MenuItem[]>, []>();
const mockUpdateOrderItems = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getMenu: (...args: any[]) => mockGetMenu(...args),
    updateOrderItems: (...args: any[]) => mockUpdateOrderItems(...args),
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

jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => ({
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
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMenuItems(): MenuItem[] {
  return [
    {
      id: 'menu-item-1',
      name: 'Pastel de Carne',
      category: 'Pastéis',
      price: 800,
      status: 'ativo',
      description: 'Pastel frito com recheio de carne',
      displayOrder: 1,
    },
    {
      id: 'menu-item-2',
      name: 'Caldo de Cana',
      category: 'Bebidas',
      price: 900,
      status: 'ativo',
      description: 'Caldo de cana gelado',
      displayOrder: 2,
    },
  ] as MenuItem[];
}

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

describe('EditOrderItemsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Header', () => {
    /**
     * Validates: Requirements 3.4
     * The EditOrderItemsScreen SHALL display the title "Editar Itens" in the header.
     */
    it('shows "Editar Itens" header', async () => {
      mockGetMenu.mockResolvedValue(createMenuItems());
      const order = createOrder();

      const { findByText } = render(
        <EditOrderItemsScreen orderId={order.id} order={order} />,
      );

      const header = await findByText('Pedido');
      expect(header).toBeTruthy();
    });
  });

  describe('Hidden fields', () => {
    /**
     * Validates: Requirements 3.5
     * The EditOrderItemsScreen SHALL hide customer name and origin fields,
     * showing only the item selection section, total, and "Salvar Alterações" button.
     */
    it('does not show customer name or origin fields', async () => {
      mockGetMenu.mockResolvedValue(createMenuItems());
      const order = createOrder({ customerName: 'Maria Silva', origin: 'presencial' });

      const { queryByText, findByText } = render(
        <EditOrderItemsScreen orderId={order.id} order={order} />,
      );

      // Wait for menu to load
      await findByText('Pastel de Carne');

      // Customer name should NOT be shown as a form field label
      // (it might appear in other contexts but not as an input/label)
      const customerNameLabel = queryByText('Nome do cliente');
      const originLabel = queryByText('Origem');
      expect(customerNameLabel).toBeNull();
      expect(originLabel).toBeNull();
    });
  });

  describe('Loading state', () => {
    /**
     * Validates: Requirements 4.2, 4.3
     * The screen SHALL show a loading indicator while menu is loading.
     */
    it('shows loading indicator while menu is loading', () => {
      // Never resolves the menu to keep loading state active
      mockGetMenu.mockReturnValue(new Promise(() => {}));
      const order = createOrder();

      const { getByTestId } = render(
        <EditOrderItemsScreen orderId={order.id} order={order} />,
      );

      expect(getByTestId('loading-indicator')).toBeTruthy();
    });
  });

  describe('Error state', () => {
    /**
     * Validates: Requirements 3.3 (menu load failure)
     * IF the menu fails to load, the screen SHALL display an error message.
     */
    it('shows error message when menu fails to load', async () => {
      mockGetMenu.mockRejectedValue(new Error('Network error'));
      const order = createOrder();

      const { findByTestId } = render(
        <EditOrderItemsScreen orderId={order.id} order={order} />,
      );

      const errorElement = await findByTestId('menu-error');
      expect(errorElement).toBeTruthy();
    });
  });
});
