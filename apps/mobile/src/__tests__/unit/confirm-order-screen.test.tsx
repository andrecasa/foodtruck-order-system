import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ConfirmOrderScreen } from '../../screens/ConfirmOrderScreen';
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
  useFocusEffect: require('../helpers/mockExpoRouter').useMockFocusEffect,
}));

const mockGetMenu = jest.fn<Promise<MenuItem[]>, any[]>();
const mockCreateOrder = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getMenu: (...args: any[]) => mockGetMenu(...args),
    createOrder: (...args: any[]) => mockCreateOrder(...args),
  },
}));

// Geolocation is optional; default to "no coordinates" (permission denied).
jest.mock('../../services/geolocation', () => ({
  getCurrentCoordinates: jest.fn(async () => null),
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

function renderScreen() {
  return render(
    <ConfirmOrderScreen
      initialItems={[
        { menuItemId: 'item-1', quantity: 2 },
        { menuItemId: 'item-2', quantity: 1 },
      ]}
      origin="presencial"
    />,
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ConfirmOrderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the resumo with items and the total resolved from the menu', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = renderScreen();

    // Items resolved from the menu, in the "Nx Name (line total)" format.
    // 2x Pastel de Carne (R$ 16,00), 1x Caldo de Cana (R$ 6,00).
    await findByText(/2x\u200E? Pastel de Carne \(R\$ 16,00\)/);
    await findByText(/1x\u200E? Caldo de Cana \(R\$ 6,00\)/);

    // Total inside the resumo card: 800*2 + 600 = 2200 → R$ 22,00.
    expect(getByTestId('confirm-total')).toBeTruthy();
    await findByText('R$ 22,00');
  });

  it('shows a validation error when the name is empty and does not create the order', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = renderScreen();

    await findByText(/2x\u200E? Pastel de Carne \(R\$ 16,00\)/);

    fireEvent.press(getByTestId('confirm-order-button'));

    expect(mockCreateOrder).not.toHaveBeenCalled();
    await findByText('Informe o nome do cliente');
  });

  it('creates the order with the trimmed name and origin, then navigates to payment', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());
    mockCreateOrder.mockResolvedValue({ id: 'new-order-1' });

    const { findByText, getByTestId } = renderScreen();

    await findByText(/2x\u200E? Pastel de Carne \(R\$ 16,00\)/);

    fireEvent.changeText(getByTestId('confirm-name-input'), '  João Silva  ');
    fireEvent.press(getByTestId('confirm-order-button'));

    await waitFor(() => {
      expect(mockCreateOrder).toHaveBeenCalledWith({
        customerName: 'João Silva',
        origin: 'presencial',
        items: [
          { menuItemId: 'item-1', quantity: 2 },
          { menuItemId: 'item-2', quantity: 1 },
        ],
      });
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/payment',
        params: { orderId: 'new-order-1' },
      });
    });
  });

  it('keeps the screen and shows an error when order creation fails', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());
    mockCreateOrder.mockRejectedValue(new Error('Falha na rede'));

    const { findByText, getByTestId } = renderScreen();

    await findByText(/2x\u200E? Pastel de Carne \(R\$ 16,00\)/);

    fireEvent.changeText(getByTestId('confirm-name-input'), 'Maria');
    fireEvent.press(getByTestId('confirm-order-button'));

    await findByText('Falha na rede');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('lets the operator edit quantities before confirming', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());
    mockCreateOrder.mockResolvedValue({ id: 'new-order-2' });

    const { findByText, getByTestId } = renderScreen();

    await findByText(/2x\u200E? Pastel de Carne \(R\$ 16,00\)/);

    // Remove the Caldo de Cana line entirely (1 → 0 removes it).
    fireEvent.press(getByTestId('decrement-item-2'));

    fireEvent.changeText(getByTestId('confirm-name-input'), 'Ana');
    fireEvent.press(getByTestId('confirm-order-button'));

    await waitFor(() => {
      expect(mockCreateOrder).toHaveBeenCalledWith({
        customerName: 'Ana',
        origin: 'presencial',
        items: [{ menuItemId: 'item-1', quantity: 2 }],
      });
    });
  });
});
