import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CustomerMenuScreen } from '../../screens/customer/CustomerMenuScreen';
import type { PublicMenuCategory } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: mockPush, back: jest.fn() }),
}));

// Controllable menu mock.
let mockMenu: {
  categories: PublicMenuCategory[];
  isLoading: boolean;
  error: { message: string } | null;
} = { categories: [], isLoading: false, error: null };
const mockRefetch = jest.fn();
jest.mock('../../hooks/customer/usePublicMenu', () => ({
  usePublicMenu: () => ({ ...mockMenu, refetch: mockRefetch }),
}));

// Controllable cart mock.
const mockAddItem = jest.fn();
const mockUpdateQuantity = jest.fn();
let mockCart = {
  items: [] as Array<{ menuItemId: string; name: string; priceCents: number; quantity: number }>,
  total: 0,
  count: 0,
};
jest.mock('../../hooks/customer/useCart', () => ({
  useCart: () => ({
    ...mockCart,
    addItem: mockAddItem,
    removeItem: jest.fn(),
    updateQuantity: mockUpdateQuantity,
    clear: jest.fn(),
  }),
}));

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCategories(): PublicMenuCategory[] {
  return [
    {
      name: 'Comidas',
      sortOrder: 0,
      items: [
        { id: 'item-1', name: 'Hamburguer', priceCents: 1000 },
        { id: 'item-2', name: 'Pastel de Queijo', priceCents: 1500 },
      ],
    },
    {
      name: 'Bebidas',
      sortOrder: 1,
      items: [{ id: 'item-3', name: 'Café Puro', priceCents: 700 }],
    },
  ] as unknown as PublicMenuCategory[];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMenu = { categories: [], isLoading: false, error: null };
  mockCart = { items: [], total: 0, count: 0 };
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CustomerMenuScreen — "Novo Pedido"', () => {
  it('renders categories and total (no name field, no order list)', () => {
    mockMenu = { categories: makeCategories(), isLoading: false, error: null };

    const { getByTestId, queryByTestId, getByText } = render(<CustomerMenuScreen slug="pastel" />);

    // The customer name is collected on the checkout screen, not here.
    expect(queryByTestId('menu-name-input')).toBeNull();
    expect(getByText('Comidas')).toBeTruthy();
    expect(getByText('Bebidas')).toBeTruthy();
    expect(getByTestId('menu-total-row')).toBeTruthy();
    expect(getByTestId('menu-create-order-button')).toBeTruthy();
    // The session-order list was moved to the "Pedidos" screen.
    expect(queryByTestId('my-orders-section')).toBeNull();
  });

  it('adds an item to the cart when its "Adicionar" button is pressed', () => {
    mockMenu = { categories: makeCategories(), isLoading: false, error: null };

    // At quantity 0 the item shows an "Adicionar" pill (not the stepper).
    const { getByTestId } = render(<CustomerMenuScreen slug="pastel" />);
    fireEvent.press(getByTestId('add-item-1'));

    expect(mockAddItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'item-1' }),
      1,
    );
  });

  it('shows the stepper (not "Adicionar") for items already in the cart', () => {
    mockMenu = { categories: makeCategories(), isLoading: false, error: null };
    mockCart = {
      items: [{ menuItemId: 'item-1', name: 'Hamburguer', priceCents: 1000, quantity: 2 }],
      total: 2000,
      count: 2,
    };

    const { getByTestId, queryByTestId } = render(<CustomerMenuScreen slug="pastel" />);

    // item-1 has qty 2 → stepper visible, no "Adicionar" pill.
    expect(getByTestId('increment-item-1')).toBeTruthy();
    expect(getByTestId('decrement-item-1')).toBeTruthy();
    expect(queryByTestId('add-item-1')).toBeNull();
    // item-2 still at 0 → shows "Adicionar".
    expect(getByTestId('add-item-2')).toBeTruthy();
  });

  it('navigates to checkout on "Criar Pedido" (name is collected there)', () => {
    mockMenu = { categories: makeCategories(), isLoading: false, error: null };
    mockCart = {
      items: [{ menuItemId: 'item-1', name: 'Hamburguer', priceCents: 1000, quantity: 1 }],
      total: 1000,
      count: 1,
    };

    const { getByTestId } = render(<CustomerMenuScreen slug="pastel" />);
    fireEvent.press(getByTestId('menu-create-order-button'));

    expect(mockPush).toHaveBeenCalledWith('/pastel/checkout');
  });

  it('shows an empty-menu message when there are no categories', () => {
    mockMenu = { categories: [], isLoading: false, error: null };

    const { getByText } = render(<CustomerMenuScreen slug="pastel" />);
    expect(getByText('Nenhum item disponível no momento.')).toBeTruthy();
  });

  it('shows an error state with a retry action', () => {
    mockMenu = { categories: [], isLoading: false, error: { message: 'Falhou' } };

    const { getByTestId, getByText } = render(<CustomerMenuScreen slug="pastel" />);
    expect(getByTestId('menu-error')).toBeTruthy();
    fireEvent.press(getByText('Tentar novamente'));
    expect(mockRefetch).toHaveBeenCalled();
  });
});
