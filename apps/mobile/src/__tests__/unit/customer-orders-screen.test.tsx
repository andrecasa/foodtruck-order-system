import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { CustomerOrdersScreen } from '../../screens/customer/CustomerOrdersScreen';
import type { SessionOrder, UseSessionOrdersResult } from '../../hooks/customer/useSessionOrders';
import type { RealtimeEvent } from '../../hooks/useRealtime';
import type { PublicOrderResponse } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace, back: jest.fn() }),
  // Run the focus callback immediately (like a mount effect).
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => cb(), []);
  },
}));

jest.mock('../../hooks/customer/usePublicBranding', () => ({
  usePublicBranding: () => ({ realtimeChannel: 'orders:queue:tenant-1' }),
}));

// Controllable session orders mock.
let mockSession: UseSessionOrdersResult;
jest.mock('../../hooks/customer/useSessionOrders', () => ({
  useSessionOrders: () => mockSession,
}));

// Full-order fetch used by usePublicOrdersTracking → public-client.
const mockFetchPublicOrders = jest.fn();
jest.mock('../../services/public-client', () => ({
  fetchPublicOrders: (...args: any[]) => mockFetchPublicOrders(...args),
}));

// Capture useRealtime's onEvent so a test can fire a status update.
let capturedOnEvent: ((e: RealtimeEvent) => void) | null = null;
jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: ({ onEvent }: { onEvent: (e: RealtimeEvent) => void }) => {
    capturedOnEvent = onEvent;
    return { status: 'connected' };
  },
}));

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

const refreshSpy = jest.fn();

function makeSession(orders: SessionOrder[]): UseSessionOrdersResult {
  return {
    orders,
    addOrder: jest.fn(),
    updateStatus: jest.fn(),
    clearOrders: jest.fn(),
    refresh: refreshSpy,
  };
}

function makeFullOrder(id: string, dailyNumber: number, status: string): PublicOrderResponse {
  return {
    id,
    dailyNumber,
    customerName: 'Maria',
    status,
    paymentStatus: 'pendente',
    origin: 'web',
    totalAmountCents: 1600,
    orderDate: '2024-01-15',
    createdAt: new Date().toISOString(),
    items: [{ itemName: 'Pastel de Carne', quantity: 2, unitPriceCents: 800 }],
  };
}

const sampleOrders: SessionOrder[] = [
  // useSessionOrders stores orders oldest-first (placement order).
  { id: 'o1', dailyNumber: 1, customerName: 'Maria', status: 'pronto' },
  { id: 'o2', dailyNumber: 2, customerName: 'Maria', status: 'preparando' },
];

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnEvent = null;
  mockSession = makeSession(sampleOrders);
  // ONE batch call returns the full orders for the requested id set.
  mockFetchPublicOrders.mockImplementation((_slug: string, ids: string[]) =>
    Promise.resolve(
      ids.map((id) =>
        id === 'o2' ? makeFullOrder('o2', 2, 'preparando') : makeFullOrder('o1', 1, 'pronto'),
      ),
    ),
  );
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CustomerOrdersScreen — "Meus Pedidos"', () => {
  it('renders a full order card per session order', async () => {
    const { getByTestId, getByText, getAllByText } = render(<CustomerOrdersScreen slug="pastel" />);

    await waitFor(() => expect(getByTestId('order-card-o1')).toBeTruthy());
    expect(getByTestId('my-orders-section')).toBeTruthy();
    expect(getByTestId('order-card-o2')).toBeTruthy();
    expect(getByText('#2 - Maria')).toBeTruthy();
    expect(getByText('#1 - Maria')).toBeTruthy();
    // Each card shows an origin badge; web orders render as "QrCode".
    expect(getByTestId('order-card-o1-origin-badge')).toBeTruthy();
    expect(getAllByText('QrCode').length).toBeGreaterThanOrEqual(2);
    // Fetched ALL session orders in a SINGLE batch call (not one per id).
    expect(mockFetchPublicOrders).toHaveBeenCalledTimes(1);
    expect(mockFetchPublicOrders).toHaveBeenCalledWith('pastel', ['o1', 'o2']);
  });

  it('shows the "Pedido criado há" footer on each card', async () => {
    const { getAllByText } = render(<CustomerOrdersScreen slug="pastel" />);
    await waitFor(() => expect(getAllByText(/Pedido criado/).length).toBeGreaterThanOrEqual(2));
  });

  it('renders the cards in the session list order (oldest first)', async () => {
    const { getByTestId, getAllByTestId } = render(<CustomerOrdersScreen slug="pastel" />);
    await waitFor(() => expect(getByTestId('order-card-o1')).toBeTruthy());

    // The session list is stored oldest-first ([o1 (#1), o2 (#2)]) and rendered
    // directly in that order, so #1 (o1) appears before #2 (o2).
    const cards = getAllByTestId(/^order-card-o\d+$/);
    const order = cards.map((c) => c.props.testID);
    expect(order).toEqual(['order-card-o1', 'order-card-o2']);
  });

  it('shows the ready banner on a "pronto" card and none on the others', async () => {
    const { getByTestId, queryByTestId } = render(<CustomerOrdersScreen slug="pastel" />);

    // o1 is "pronto" → ready banner; o2 is "preparando" → no banner.
    await waitFor(() => expect(getByTestId('order-card-o1-ready-banner')).toBeTruthy());
    expect(queryByTestId('order-card-o2-ready-banner')).toBeNull();
    expect(queryByTestId('order-card-o1-delivered-banner')).toBeNull();
  });

  it('swaps to the delivered banner when a card becomes "entregue"', async () => {
    const { getByTestId, queryByTestId } = render(<CustomerOrdersScreen slug="pastel" />);
    await waitFor(() => expect(getByTestId('order-card-o1-ready-banner')).toBeTruthy());

    act(() => {
      capturedOnEvent?.({
        channel: 'orders:queue:tenant-1',
        event: 'status_updated',
        payload: { id: 'o1', status: 'entregue' },
      });
    });

    await waitFor(() => expect(getByTestId('order-card-o1-delivered-banner')).toBeTruthy());
    expect(queryByTestId('order-card-o1-ready-banner')).toBeNull();
  });

  it('refreshes the session list on focus', async () => {
    const { getByTestId } = render(<CustomerOrdersScreen slug="pastel" />);
    expect(refreshSpy).toHaveBeenCalled();
    // Let the async order fetches settle to avoid act() warnings.
    await waitFor(() => expect(getByTestId('order-card-o1')).toBeTruthy());
  });

  it('applies a realtime status_updated event to the matching card', async () => {
    const { getByTestId, getByText, queryByText } = render(
      <CustomerOrdersScreen slug="pastel" />,
    );
    await waitFor(() => expect(getByTestId('order-card-o1')).toBeTruthy());

    act(() => {
      capturedOnEvent?.({
        channel: 'orders:queue:tenant-1',
        event: 'status_updated',
        payload: { id: 'o1', status: 'entregue' },
      });
    });

    // Order o1's status badge flips to "Entregue".
    await waitFor(() => expect(getByText('Entregue')).toBeTruthy());
    // o2 is still preparando.
    expect(queryByText('Preparando')).toBeTruthy();
  });

  it('shows an empty state when there are no session orders', () => {
    mockSession = makeSession([]);
    const { getByText, queryByTestId } = render(<CustomerOrdersScreen slug="pastel" />);
    // Illustrated empty state (no order cards rendered).
    expect(getByText('Nenhum pedido na fila')).toBeTruthy();
    expect(queryByTestId('my-orders-section')).toBeNull();
  });
});
