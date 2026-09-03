import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CreateOrderScreen } from '../../screens/CreateOrderScreen';
import type { MenuItem } from '@order-system/shared';

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

const mockGetMenu = jest.fn<Promise<MenuItem[]>, any[]>();
const mockCreateOrder = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getMenu: (...args: any[]) => mockGetMenu(...args),
    createOrder: (...args: any[]) => mockCreateOrder(...args),
  },
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMenuItems(): MenuItem[] {
  return [
    {
      id: 'item-1',
      name: 'Pastel de Carne',
      category: 'Pastéis',
      price: 800,
      status: 'ativo',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'item-2',
      name: 'Caldo de Cana',
      category: 'Bebidas',
      price: 600,
      status: 'ativo',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CreateOrderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with origin selector and menu items', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    // Origin selector
    expect(getByTestId('origin-selector')).toBeTruthy();

    // Menu items rendered after loading
    await findByText('Pastel de Carne');
    await findByText('Caldo de Cana');
  });

  it('can increment/decrement item quantities', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // At qty 0 the item shows "Adicionar"; tapping it adds the first unit.
    fireEvent.press(getByTestId('add-item-1'));
    // Now the stepper is visible.
    fireEvent.press(getByTestId('increment-item-1'));

    // Decrement
    fireEvent.press(getByTestId('decrement-item-1'));

    // After +2 -1, quantity should be 1 — verify via text '1'
    await findByText('1');
  });

  it('shows total price updates when items change', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // Add pastel (R$ 8,00) then increment → total = R$ 16,00
    fireEvent.press(getByTestId('add-item-1'));
    fireEvent.press(getByTestId('increment-item-1'));

    await findByText('R$ 16,00');
  });

  it('submits order with selected items', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());
    mockCreateOrder.mockResolvedValue({ id: 'new-order-1' });

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // Fill customer name
    fireEvent.changeText(getByTestId('input-customer-name'), 'João Silva');

    // Add item (shows "Adicionar" at qty 0)
    fireEvent.press(getByTestId('add-item-1'));

    // Submit
    fireEvent.press(getByTestId('submit-order'));

    await waitFor(() => {
      expect(mockCreateOrder).toHaveBeenCalledWith({
        customerName: 'João Silva',
        origin: 'presencial',
        items: [{ menuItemId: 'item-1', quantity: 1 }],
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/payment',
        params: { orderId: 'new-order-1' },
      });
    });
  });
});
