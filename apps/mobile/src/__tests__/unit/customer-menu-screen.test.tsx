import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { CustomerMenuScreen } from '../../screens/customer/CustomerMenuScreen';
import type { RealtimeEvent } from '../../hooks/useRealtime';
import type { SessionOrder } from '../../hooks/customer/useSessionOrders';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  // Run the focus callback once on mount (like a real focus), without effects.
  useFocusEffect: (cb: () => void) => {
    const React2 = require('react');
    React2.useEffect(() => {
      const cleanup = cb();
      return cleanup;
    }, []);
  },
}));

// Empty menu (not loading) — we only care about the "Meus pedidos" list here.
jest.mock('../../hooks/customer/usePublicMenu', () => ({
  usePublicMenu: () => ({ categories: [], isLoading: false, error: null, refetch: jest.fn() }),
}));

// Empty cart.
jest.mock('../../hooks/customer/useCart', () => ({
  useCart: () => ({
    items: [],
    addItem: jest.fn(),
    removeItem: jest.fn(),
    updateQuantity: jest.fn(),
    clear: jest.fn(),
    total: 0,
    count: 0,
  }),
}));

jest.mock('../../hooks/customer/usePublicBranding', () => ({
  usePublicBranding: () => ({ realtimeChannel: 'orders:queue:tenant-1' }),
}));

// Controllable session-orders mock: holds the list in React state so
// updateStatus re-renders the screen with the new status. Prefixed with `mock`
// so jest allows referencing it inside the mock factory.
let mockSeededOrders: SessionOrder[] = [];
jest.mock('../../hooks/customer/useSessionOrders', () => ({
  useSessionOrders: () => {
    const React2 = require('react');
    const [orders, setOrders] = React2.useState(mockSeededOrders);
    const updateStatus = React2.useCallback((orderId: string, status: string) => {
      setOrders((prev: SessionOrder[]) =>
        prev.map((o: SessionOrder) => (o.id === orderId ? { ...o, status } : o)),
      );
    }, []);
    return {
      orders,
      addOrder: jest.fn(),
      updateStatus,
      clearOrders: jest.fn(),
      refresh: jest.fn(),
    };
  },
}));

// Capture the onEvent handler passed to useRealtime so tests can fire events.
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

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnEvent = null;
  mockSeededOrders = [];
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CustomerMenuScreen — "Meus pedidos" list', () => {
  it('renders a session order with the status icon (aguardando → schedule)', async () => {
    mockSeededOrders = [{ id: 'order-1', dailyNumber: 3, customerName: 'Jeremias', status: 'aguardando' }];

    const { getByTestId, getByText, queryByText } = render(<CustomerMenuScreen slug="pastel" />);

    await waitFor(() => expect(getByTestId('track-order-order-1')).toBeTruthy());
    expect(getByText('Pedido #3 - Jeremias')).toBeTruthy();
    // Status icon glyph for 'aguardando'.
    expect(queryByText('schedule')).toBeTruthy();
  });

  it('updates the item icon live on a matching status_updated event', async () => {
    mockSeededOrders = [{ id: 'order-1', dailyNumber: 3, customerName: 'Jeremias', status: 'aguardando' }];

    const { getByTestId, queryByText } = render(<CustomerMenuScreen slug="pastel" />);
    await waitFor(() => expect(getByTestId('track-order-order-1')).toBeTruthy());
    expect(queryByText('schedule')).toBeTruthy(); // aguardando
    expect(queryByText('local_fire_department')).toBeNull(); // not preparando yet

    act(() => {
      capturedOnEvent?.({
        channel: 'orders:queue:tenant-1',
        event: 'status_updated',
        payload: { id: 'order-1', status: 'preparando' },
      });
    });

    // Icon switches to 'preparando' (local_fire_department) and 'schedule' is gone.
    await waitFor(() => expect(queryByText('local_fire_department')).toBeTruthy());
    expect(queryByText('schedule')).toBeNull();
  });

  it('ignores status_updated events for an order not in the session', async () => {
    mockSeededOrders = [{ id: 'order-1', dailyNumber: 3, customerName: 'Jeremias', status: 'aguardando' }];

    const { getByTestId, queryByText } = render(<CustomerMenuScreen slug="pastel" />);
    await waitFor(() => expect(getByTestId('track-order-order-1')).toBeTruthy());

    act(() => {
      capturedOnEvent?.({
        channel: 'orders:queue:tenant-1',
        event: 'status_updated',
        payload: { id: 'other-order', status: 'pronto' },
      });
    });

    // Unchanged — still 'aguardando'.
    expect(queryByText('schedule')).toBeTruthy();
    expect(queryByText('notifications')).toBeNull();
  });
});
