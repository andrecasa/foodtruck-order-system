import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MonthlySummaryScreen } from '../../screens/MonthlySummaryScreen';
import type { MonthlySummaryResponse } from '@order-system/shared';

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

const mockGetMonthlySummary = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
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

function createMonthlySummary(): MonthlySummaryResponse {
  return {
    year: 2024,
    month: 1,
    days: [],
    totals: {
      totalOrders: 45,
      totalRevenue: 50000,
      totalReceived: 38000,
      totalPending: 12000,
    },
    byPaymentMethod: {
      pix: 20000,
      'cartão débito': 8000,
      'cartão crédito': 4000,
      dinheiro: 6000,
    },
  } as MonthlySummaryResponse;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MonthlySummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders monthly totals', async () => {
    mockGetMonthlySummary.mockResolvedValue(createMonthlySummary());

    const { findByText, findAllByText } = render(<MonthlySummaryScreen />);

    // Total orders
    await findByText('45');
    // Total revenue (R$ 500,00)
    await findByText('R$ 500,00');
    // Received (R$ 380,00)
    await findByText('R$ 380,00');
    // Pending — may appear in both sub-card and payment breakdown
    const pendingElements = await findAllByText('R$ 120,00');
    expect(pendingElements.length).toBeGreaterThanOrEqual(1);
  });

  it('navigates between months', async () => {
    mockGetMonthlySummary.mockResolvedValue(createMonthlySummary());

    const { findByLabelText, findByText } = render(<MonthlySummaryScreen />);

    // Wait for initial load
    await findByText('45');

    // Navigate to previous month
    const prevButton = await findByLabelText('Mês anterior');
    mockGetMonthlySummary.mockResolvedValue({
      ...createMonthlySummary(),
      month: 12,
      year: 2023,
      totals: { ...createMonthlySummary().totals, totalOrders: 30 },
    });

    fireEvent.press(prevButton);

    await waitFor(() => {
      expect(mockGetMonthlySummary).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
