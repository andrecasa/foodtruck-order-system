import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { CustomerTrackingScreen } from '../../screens/customer/CustomerTrackingScreen';
import type { PublicOrderResponse } from '@order-system/shared';
import type { RealtimeEvent } from '../../hooks/useRealtime';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../hooks/customer/usePublicBranding', () => ({
  usePublicBranding: () => ({ realtimeChannel: 'orders:queue:tenant-1' }),
}));

const mockFetchPublicOrder = jest.fn();
jest.mock('../../services/public-client', () => ({
  fetchPublicOrder: (...args: any[]) => mockFetchPublicOrder(...args),
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

function makeOrder(overrides: Partial<PublicOrderResponse> = {}): PublicOrderResponse {
  return {
    id: 'order-abc',
    dailyNumber: 42,
    customerName: 'Maria',
    status: 'aguardando',
    paymentStatus: 'pendente',
    totalAmountCents: 1600,
    orderDate: '2024-01-15',
    createdAt: '2024-01-15T10:00:00Z',
    items: [{ itemName: 'Pastel de Carne', quantity: 2, unitPriceCents: 800 }],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedOnEvent = null;
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CustomerTrackingScreen', () => {
  it('fetches and renders the order number, name, items and status', async () => {
    mockFetchPublicOrder.mockResolvedValueOnce(makeOrder());
    const { getByTestId, getByText } = render(
      <CustomerTrackingScreen slug="pastel" orderId="order-abc" />,
    );

    await waitFor(() => expect(getByTestId('tracking-number-card')).toBeTruthy());
    expect(mockFetchPublicOrder).toHaveBeenCalledWith('pastel', 'order-abc');
    expect(getByText('#42')).toBeTruthy();
    expect(getByText('Maria')).toBeTruthy();
    expect(getByTestId('tracking-status-badge')).toBeTruthy();
    expect(getByTestId('tracking-payment-badge')).toBeTruthy();
    expect(getByText('Pendente')).toBeTruthy();
    expect(getByTestId('tracking-summary')).toBeTruthy();
  });

  it('updates the status when a matching status_updated realtime event arrives', async () => {
    mockFetchPublicOrder.mockResolvedValueOnce(makeOrder({ status: 'aguardando' }));
    const { getByTestId, queryByTestId } = render(
      <CustomerTrackingScreen slug="pastel" orderId="order-abc" />,
    );

    await waitFor(() => expect(getByTestId('tracking-number-card')).toBeTruthy());
    expect(queryByTestId('tracking-ready-banner')).toBeNull();

    act(() => {
      capturedOnEvent?.({
        channel: 'orders:queue:tenant-1',
        event: 'status_updated',
        payload: { id: 'order-abc', status: 'pronto' },
      });
    });

    await waitFor(() => expect(getByTestId('tracking-ready-banner')).toBeTruthy());
  });

  it('ignores realtime events for a different order id', async () => {
    mockFetchPublicOrder.mockResolvedValueOnce(makeOrder({ status: 'aguardando' }));
    const { getByTestId, queryByTestId } = render(
      <CustomerTrackingScreen slug="pastel" orderId="order-abc" />,
    );

    await waitFor(() => expect(getByTestId('tracking-number-card')).toBeTruthy());

    act(() => {
      capturedOnEvent?.({
        channel: 'orders:queue:tenant-1',
        event: 'status_updated',
        payload: { id: 'some-other-order', status: 'pronto' },
      });
    });

    expect(queryByTestId('tracking-ready-banner')).toBeNull();
  });

  it('shows the delivered completion message when status is entregue', async () => {
    mockFetchPublicOrder.mockResolvedValueOnce(makeOrder({ status: 'entregue' }));
    const { getByTestId } = render(
      <CustomerTrackingScreen slug="pastel" orderId="order-abc" />,
    );

    await waitFor(() => expect(getByTestId('tracking-delivered-banner')).toBeTruthy());
  });

  it('renders an error state when the initial fetch returns 404', async () => {
    const { NetworkError } = require('../../services/real-client');
    mockFetchPublicOrder.mockRejectedValueOnce(new NetworkError('não encontrado', 404));
    const { getByTestId } = render(
      <CustomerTrackingScreen slug="pastel" orderId="missing" />,
    );

    await waitFor(() => expect(getByTestId('tracking-error')).toBeTruthy());
  });
});
