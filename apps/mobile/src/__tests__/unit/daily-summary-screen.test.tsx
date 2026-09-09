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
  useFocusEffect: require('../helpers/mockExpoRouter').useMockFocusEffect,
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
const mockGetOrders = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getDailySummary: (...args: any[]) => mockGetDailySummary(...args),
    getMonthlySummary: (...args: any[]) => mockGetMonthlySummary(...args),
    getOrders: (...args: any[]) => mockGetOrders(...args),
  },
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

// Mock do mapa: renderiza um testID por ponto para asserir a fiação sem montar
// o Leaflet (que exige DOM). Reflete o contrato { points }.
const mockDailyOrdersMap = jest.fn();
jest.mock('../../components', () => {
  const actual = jest.requireActual('../../components');
  const { View } = require('react-native');
  return {
    ...actual,
    DailyOrdersMap: (props: any) => {
      mockDailyOrdersMap(props);
      return (
        <View testID="daily-orders-map-mock">
          {props.points.map((p: any) => (
            <View key={p.id} testID={`map-point-${p.id}`} />
          ))}
        </View>
      );
    },
  };
});

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

function createOrder(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? 'order-1',
    dailyNumber: overrides.dailyNumber ?? 1,
    customerName: overrides.customerName ?? 'Cliente',
    origin: 'web',
    status: overrides.status ?? 'aguardando',
    paymentStatus: 'pendente',
    items: [],
    totalAmount: 1000,
    createdAt: '2024-01-15T10:00:00.000Z',
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DailySummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Padrão: sem pedidos, para os testes que não exercitam o mapa.
    mockGetOrders.mockResolvedValue([]);
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

  it('busca os pedidos do dia com a data corrente para montar o mapa', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });

    const { findByTestId } = render(<DailySummaryScreen />);

    await findByTestId('daily-orders-map-mock');
    expect(mockGetOrders).toHaveBeenCalledWith(
      expect.objectContaining({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }),
    );
  });

  it('plota apenas pedidos com coordenadas e descarta os sem localização', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });
    mockGetOrders.mockResolvedValue([
      createOrder({ id: 'com-geo', latitude: -23.55, longitude: -46.63 }),
      createOrder({ id: 'sem-geo', latitude: undefined, longitude: undefined }),
    ]);

    const { findByTestId, queryByTestId } = render(<DailySummaryScreen />);

    // O pedido com coordenadas vira ponto; o sem coordenadas é filtrado.
    await findByTestId('map-point-com-geo');
    expect(queryByTestId('map-point-sem-geo')).toBeNull();
  });

  it('mostra o contador "X de Y pedidos com localização"', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });
    mockGetOrders.mockResolvedValue([
      createOrder({ id: 'com-geo', latitude: -23.55, longitude: -46.63 }),
      createOrder({ id: 'sem-geo', latitude: undefined, longitude: undefined }),
    ]);

    const { findByText } = render(<DailySummaryScreen />);

    // 1 dos 2 pedidos do dia tem localização.
    await findByText('1 de 2 pedidos com localização');
  });

  it('renderiza o mapa mesmo quando nenhum pedido tem localização', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });
    mockGetOrders.mockResolvedValue([
      createOrder({ id: 'sem-geo', latitude: undefined, longitude: undefined }),
    ]);

    const { findByTestId, queryByTestId } = render(<DailySummaryScreen />);

    await findByTestId('daily-orders-map-mock');
    expect(queryByTestId('map-point-sem-geo')).toBeNull();
  });

  it('não derruba o resumo quando a busca de pedidos do mapa falha', async () => {
    mockGetDailySummary.mockResolvedValue(createDailySummary());
    mockGetMonthlySummary.mockResolvedValue({ days: [], totals: {} });
    mockGetOrders.mockRejectedValue(new Error('falha de rede'));

    const { findByText, findByTestId } = render(<DailySummaryScreen />);

    // Resumo continua renderizando normalmente; mapa fica vazio.
    await findByText('12');
    await findByTestId('daily-orders-map-mock');
  });
});
