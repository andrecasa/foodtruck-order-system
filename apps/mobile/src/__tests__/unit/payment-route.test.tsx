import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import PaymentRoute from '../../../app/payment';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockReplace = jest.fn();
const mockBack = jest.fn();

// Params controlados por teste (orderId + fromNewOrder).
let mockParams: { orderId?: string; fromNewOrder?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: mockBack, push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: require('../helpers/mockExpoRouter').useMockFocusEffect,
}));

const mockGetOrderById = jest.fn();
jest.mock('../../services/api-client', () => ({
  apiClient: {
    getOrderById: (...args: any[]) => mockGetOrderById(...args),
  },
}));

// PaymentScreen mockado: dispara `onPaymentSuccess` imediatamente ao montar,
// para exercitar a decisão de navegação da rota sem simular o fluxo de UI.
jest.mock('../../screens/PaymentScreen', () => {
  const React = require('react');
  return {
    PaymentScreen: ({ onPaymentSuccess }: { onPaymentSuccess?: () => void }) => {
      React.useEffect(() => {
        onPaymentSuccess?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeOrder() {
  return {
    id: 'order-123',
    dailyNumber: 5,
    customerName: 'Maria',
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
    items: [],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('/payment route — navegação após pagamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetOrderById.mockResolvedValue(makeOrder());
  });

  it('vindo de um novo pedido (fromNewOrder=1), vai para a fila de Pedidos', async () => {
    mockParams = { orderId: 'order-123', fromNewOrder: '1' };

    render(<PaymentRoute />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('vindo da fila (sem fromNewOrder), volta para a tela anterior (fila)', async () => {
    mockParams = { orderId: 'order-123' };

    render(<PaymentRoute />);

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
