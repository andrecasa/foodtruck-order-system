import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
const mockGetMonthlyHeatmap = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getMonthlySummary: (...args: any[]) => mockGetMonthlySummary(...args),
    getMonthlyHeatmap: (...args: any[]) => mockGetMonthlyHeatmap(...args),
  },
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

// Mock do heatmap: expõe a contagem de pontos sem montar Leaflet/WebView.
const mockMonthlyHeatmap = jest.fn();
jest.mock('../../components', () => {
  const actual = jest.requireActual('../../components');
  const { View } = require('react-native');
  return {
    ...actual,
    MonthlyHeatmap: (props: any) => {
      mockMonthlyHeatmap(props);
      return <View testID="monthly-heatmap-mock" accessibilityLabel={String(props.points.length)} />;
    },
  };
});

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

function createHeatmap(overrides: Partial<any> = {}): any {
  return {
    year: 2024,
    month: 1,
    totalOrders: 45,
    geolocatedOrders: 12,
    points: [
      { latitude: -23.5, longitude: -46.6, weight: 3 },
      { latitude: -22.9, longitude: -43.2, weight: 1 },
    ],
    ...overrides,
  };
}

describe('MonthlySummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Padrão: heatmap vazio para os testes que não o exercitam.
    mockGetMonthlyHeatmap.mockResolvedValue(createHeatmap({ geolocatedOrders: 0, points: [] }));
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

  it('opens calendar modal via AppBar icon', async () => {
    mockGetMonthlySummary.mockResolvedValue(createMonthlySummary());

    const { findByText, findByLabelText } = render(<MonthlySummaryScreen />);

    // Wait for initial load
    await findByText('45');

    // Calendar icon in AppBar should be present and pressable
    const calendarButton = await findByLabelText('Selecionar mês');
    fireEvent.press(calendarButton);

    // Verify getMonthlySummary was called on initial load
    expect(mockGetMonthlySummary).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('busca o heatmap no carregamento e passa os pontos ao mapa', async () => {
    mockGetMonthlySummary.mockResolvedValue(createMonthlySummary());
    mockGetMonthlyHeatmap.mockResolvedValue(createHeatmap());

    const { findByTestId } = render(<MonthlySummaryScreen />);

    const mapMock = await findByTestId('monthly-heatmap-mock');
    // 2 pontos passados ao componente.
    expect(mapMock.props.accessibilityLabel).toBe('2');
    expect(mockGetMonthlyHeatmap).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
  });

  it('mostra o contador "X de Y pedidos com localização"', async () => {
    mockGetMonthlySummary.mockResolvedValue(createMonthlySummary());
    mockGetMonthlyHeatmap.mockResolvedValue(createHeatmap({ geolocatedOrders: 12, totalOrders: 45 }));

    const { findByText } = render(<MonthlySummaryScreen />);

    await findByText('12 de 45 pedidos com localização');
  });

  it('não derruba os números quando a busca do heatmap falha', async () => {
    mockGetMonthlySummary.mockResolvedValue(createMonthlySummary());
    mockGetMonthlyHeatmap.mockRejectedValue(new Error('falha'));

    const { findByText, findByTestId } = render(<MonthlySummaryScreen />);

    // Totais continuam renderizando; heatmap fica vazio (0 pontos).
    await findByText('45');
    const mapMock = await findByTestId('monthly-heatmap-mock');
    expect(mapMock.props.accessibilityLabel).toBe('0');
  });
});
