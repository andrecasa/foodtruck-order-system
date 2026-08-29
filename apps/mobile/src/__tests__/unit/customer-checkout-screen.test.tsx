import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CustomerCheckoutScreen } from '../../screens/customer/CustomerCheckoutScreen';
import type { CartItem, UseCartResult } from '../../hooks/customer/useCart';
import type { PublicOrderResponse } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

// Cart mock — controlled per test via mockCart.
let mockCart: UseCartResult;
const clearSpy = jest.fn();
jest.mock('../../hooks/customer/useCart', () => ({
  useCart: () => mockCart,
}));

// createPublicOrder mock (via public-client).
const mockCreatePublicOrder = jest.fn();
jest.mock('../../services/public-client', () => ({
  createPublicOrder: (...args: any[]) => mockCreatePublicOrder(...args),
}));

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCart(items: CartItem[]): UseCartResult {
  const total = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  return {
    items,
    addItem: jest.fn(),
    removeItem: jest.fn(),
    updateQuantity: jest.fn(),
    clear: clearSpy,
    total,
    count,
  };
}

const sampleItems: CartItem[] = [
  { menuItemId: 'm1', name: 'Pastel de Carne', priceCents: 800, quantity: 2 },
  { menuItemId: 'm2', name: 'Caldo de Cana', priceCents: 500, quantity: 1 },
];

const sampleOrder: PublicOrderResponse = {
  id: 'order-abc',
  dailyNumber: 7,
  customerName: 'Maria',
  status: 'aguardando',
  paymentStatus: 'pendente',
  totalAmountCents: 2100,
  orderDate: '2024-01-15',
  createdAt: '2024-01-15T10:00:00Z',
  items: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCart = makeCart(sampleItems);
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CustomerCheckoutScreen', () => {
  it('renders the order summary with the cart total', () => {
    const { getByTestId } = render(<CustomerCheckoutScreen slug="pastel" />);
    // Total: 800*2 + 500 = 2100 → R$ 21,00
    expect(getByTestId('order-summary-total').props.children).toContain('21,00');
  });

  it('shows a validation error when the name is empty and does not submit', () => {
    const { getByTestId, queryByTestId } = render(<CustomerCheckoutScreen slug="pastel" />);
    fireEvent.press(getByTestId('checkout-confirm-button'));
    expect(mockCreatePublicOrder).not.toHaveBeenCalled();
    expect(queryByTestId('checkout-name-input')).toBeTruthy();
  });

  it('submits the trimmed name and mapped items, clears cart, and navigates on success', async () => {
    mockCreatePublicOrder.mockResolvedValueOnce(sampleOrder);
    const { getByTestId } = render(<CustomerCheckoutScreen slug="pastel" />);

    fireEvent.changeText(getByTestId('checkout-name-input'), '  Maria  ');
    fireEvent.press(getByTestId('checkout-confirm-button'));

    await waitFor(() => expect(mockCreatePublicOrder).toHaveBeenCalledTimes(1));
    expect(mockCreatePublicOrder).toHaveBeenCalledWith('pastel', {
      customerName: 'Maria',
      items: [
        { menuItemId: 'm1', quantity: 2 },
        { menuItemId: 'm2', quantity: 1 },
      ],
    });

    await waitFor(() => expect(clearSpy).toHaveBeenCalledTimes(1));
    expect(mockReplace).toHaveBeenCalledWith('/pastel/pedido/order-abc');
  });

  it('shows a friendly error and does NOT clear the cart when creation fails', async () => {
    mockCreatePublicOrder.mockRejectedValueOnce(new Error('Falha na rede'));
    const { getByTestId } = render(<CustomerCheckoutScreen slug="pastel" />);

    fireEvent.changeText(getByTestId('checkout-name-input'), 'João');
    fireEvent.press(getByTestId('checkout-confirm-button'));

    await waitFor(() => expect(getByTestId('checkout-error')).toBeTruthy());
    expect(clearSpy).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('renders an empty-cart state instead of the form when the cart is empty', () => {
    mockCart = makeCart([]);
    const { getByTestId, queryByTestId } = render(<CustomerCheckoutScreen slug="pastel" />);
    expect(getByTestId('checkout-empty')).toBeTruthy();
    expect(queryByTestId('checkout-confirm-button')).toBeNull();
  });
});
