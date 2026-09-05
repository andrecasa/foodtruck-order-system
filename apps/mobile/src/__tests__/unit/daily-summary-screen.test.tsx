import React from 'react';
import { render } from '@testing-library/react-native';
import { DailySummaryScreen } from '../../screens/DailySummaryScreen';
import type { DailySummary } from '@order-system/shared';

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

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { email: 'admin@test.com', role: 'admin' },
    tenantId: '11111111-1111-4111-8111-111111111111',
    isLoading: false,
    isAuthenticated: true,
    login: jest.fn(),
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

const mockGetDailySummary = jest.fn();
const mockGetMonthlySummary = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getDailySummary: (...args: any[]) => mockGetDailySummary(...args),
    getMonthlySummary: (...args: any[]) => mockGetMonthlySummary(...args),
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

function createDailySummary(): DailySummary {
  return {
    date: '2024-01-15',
    totalOrders: 12,
    paidTotal: 15000,
    pendingTotal: 5000,
    byPaymentMethod: {
      pix: 8000,
      'cartão débito': 3000,
      'cartão crédito': 2000,
      dinheiro: 2000,
    },
  } as DailySummary;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DailySummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders summary with totals', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });

    const { findByText, findAllByText } = render(<DailySummaryScreen />);

    // Total orders
    await findByText('12');
    // Faturamento (paidTotal + pendingTotal = 20000 = R$ 200,00)
    await findByText('R$ 200,00');
    // Recebido (paidTotal = 15000 = R$ 150,00)
    await findByText('R$ 150,00');
    // Pendente = R$ 50,00 (same as Cartão) — appears multiple times
    const fiftyElements = await findAllByText('R$ 50,00');
    expect(fiftyElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows payment method breakdown', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });

    const { findByText, findAllByText } = render(<DailySummaryScreen />);

    await findByText('Formas de Pagamento');
    await findByText('PIX');
    await findByText('R$ 80,00');
    await findByText('Cartão Débito');
    await findByText('Cartão Crédito');
    // R$ 50,00 may appear in Pendente and/or card breakdown rows
    const fiftyElements = await findAllByText('R$ 50,00');
    expect(fiftyElements.length).toBeGreaterThanOrEqual(1);
    await findByText('Dinheiro');
    // R$ 20,00 appears in both Cartão Crédito and Dinheiro rows
    const twentyElements = await findAllByText('R$ 20,00');
    expect(twentyElements.length).toBeGreaterThanOrEqual(1);
  });
});
