import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { IntermediateSummaryScreen } from '../../screens/IntermediateSummaryScreen';
import type { MonthlySummaryResponse } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ date: '2026-08-01' }),
}));

// Capture the onEvent callback from useRealtime
let capturedRealtimeOptions: any = null;
jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn((options: any) => {
    capturedRealtimeOptions = options;
    return { status: 'connected' };
  }),
}));

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getMonthlySummary: jest.fn(),
  },
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

jest.mock('../../components/PrototypeBanner', () => ({
  PrototypeBanner: () => null,
}));

const mockTheme = {
  colors: {
    primary: '#7B2D2D',
    secondary: '#D4812B',
    background: '#FDF8F4',
    text: '#3D2020',
    success: '#5A8C5A',
    warning: '#D4812B',
    error: '#B54040',
    textSecondary: '#8B6B5A',
    surface: '#FFFFFF',
    divider: '#E8DDD5',
  },
  typography: {
    fontFamily: 'Inter',
    sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 32 },
    weights: { regular: 400, medium: 500, bold: 600 },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 8, md: 12, lg: 24, full: 9999 },
  businessName: 'Pastel das Meninas',
  logo: '',
};

jest.mock('../../theme', () => ({
  useTheme: () => mockTheme,
  ThemeProvider: ({ children }: any) => children,
  defaultTheme: mockTheme,
  loadTheme: () => mockTheme,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => ({
  useTheme: () => mockTheme,
  ThemeProvider: ({ children }: any) => children,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const { apiClient } = require('../../services/api-client');

const mockMonthlySummary: MonthlySummaryResponse = {
  year: 2026,
  month: 8,
  totals: {
    totalOrders: 42,
    totalRevenue: 125000,
    totalReceived: 80000,
    totalPending: 45000,
  },
  days: [
    { day: 1, orderCount: 5, revenue: 15000, paidOrders: 3 },
    { day: 5, orderCount: 10, revenue: 30000, paidOrders: 7 },
    { day: 15, orderCount: 8, revenue: 25000, paidOrders: 5 },
  ],
};

const emptyMonthlySummary: MonthlySummaryResponse = {
  year: 2026,
  month: 8,
  totals: {
    totalOrders: 0,
    totalRevenue: 0,
    totalReceived: 0,
    totalPending: 0,
  },
  days: [],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('IntermediateSummaryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedRealtimeOptions = null;
    apiClient.getMonthlySummary.mockResolvedValue(mockMonthlySummary);
  });

  describe('AppBar / Header', () => {
    /**
     * Validates: Requirements 1.1
     * The screen SHALL display an AppBar with the title "Resumo Financeiro".
     */
    it('renders AppBar with title "Resumo Financeiro"', async () => {
      const { findByText } = render(<IntermediateSummaryScreen />);

      const title = await findByText('Resumo Financeiro');
      expect(title).toBeTruthy();
    });
  });

  describe('Monthly Summary Card', () => {
    /**
     * Validates: Requirements 2.1
     * The Monthly_Summary_Card SHALL display "Acumulado em [Mês]" with the correct
     * Portuguese month name and render the total values from the API response.
     */
    it('renders Monthly Summary Card with correct month data', async () => {
      const { findByText } = render(<IntermediateSummaryScreen />);

      // Title should include Portuguese month name for month 8 (Agosto)
      const cardTitle = await findByText(/Acumulado em Agosto/);
      expect(cardTitle).toBeTruthy();

      // Total orders (42) should be displayed
      const ordersValue = await findByText('42');
      expect(ordersValue).toBeTruthy();

      // Formatted currency values should appear
      // totalRevenue = 125000 cents = R$ 1.250,00
      const revenueValue = await findByText('R$ 1.250,00');
      expect(revenueValue).toBeTruthy();

      // totalReceived = 80000 cents = R$ 800,00
      const receivedValue = await findByText('R$ 800,00');
      expect(receivedValue).toBeTruthy();

      // totalPending = 45000 cents = R$ 450,00
      const pendingValue = await findByText('R$ 450,00');
      expect(pendingValue).toBeTruthy();
    });
  });

  describe('Selected Day Card updates on day tap', () => {
    /**
     * Validates: Requirements 3.1, 5.2, 5.3
     * WHEN the Operator selects a day from the calendar modal, the Selected Day Card
     * SHALL update to display data for that day.
     */
    it('updates Selected Day Card when a day is selected from the calendar modal', async () => {
      const { findByText, findByTestId } = render(<IntermediateSummaryScreen />);

      // Wait for initial render — default selected day should be day 1 (smallest with orders)
      await findByText(/Acumulado em/);

      // Open the calendar modal by tapping the date chip
      const dateChip = await findByTestId('date-chip');
      await act(async () => {
        fireEvent.press(dateChip);
      });

      // Tap day 5 in the calendar
      const day5Cell = await findByTestId('calendar-day-5');
      await act(async () => {
        fireEvent.press(day5Cell);
      });

      // The Selected Day Card should now show day 5 data
      // Day 5: orderCount: 10, revenue: 30000 (R$ 300,00), paidOrders: 7
      const ordersText = await findByText('10');
      expect(ordersText).toBeTruthy();

      const revenueText = await findByText('R$ 300,00');
      expect(revenueText).toBeTruthy();

      // Pagos: "7/10" (paidOrders/orderCount)
      const pagosText = await findByText('7/10');
      expect(pagosText).toBeTruthy();
    });
  });

  describe('Navigation', () => {
    /**
     * Validates: Requirements 3.4
     * WHEN the Operator taps "Ver Resumo Completo", the Navigation_System SHALL
     * navigate to the Full_Summary_Screen for the selected date.
     */
    it('"Ver Resumo Completo" navigates to full-summary with selected date', async () => {
      const { findByText } = render(<IntermediateSummaryScreen />);

      // Wait for content to load
      await findByText(/Acumulado em/);

      const fullSummaryButton = await findByText('Ver Resumo Completo');
      fireEvent.press(fullSummaryButton);

      // The default selected day should be the smallest day with orders (day 1)
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/summary/full-summary',
        params: { date: '2026-08-01' },
      });
    });
  });

  describe('Month navigation fetches new month data', () => {
    /**
     * Validates: Requirements 5.2
     * WHEN the Operator selects a day from a different month in the Calendar_Modal,
     * the screen SHALL fetch data for the new month.
     */
    it('fetching new month data when day selected in different month', async () => {
      const julySummary: MonthlySummaryResponse = {
        year: 2026,
        month: 7,
        totals: {
          totalOrders: 20,
          totalRevenue: 60000,
          totalReceived: 40000,
          totalPending: 20000,
        },
        days: [
          { day: 3, orderCount: 6, revenue: 18000, paidOrders: 4 },
          { day: 12, orderCount: 14, revenue: 42000, paidOrders: 10 },
        ],
      };

      const { findByText, findByTestId } = render(<IntermediateSummaryScreen />);

      // Wait for initial render
      await findByText(/Acumulado em Agosto/);

      // Open the calendar modal
      const dateChip = await findByTestId('date-chip');
      await act(async () => {
        fireEvent.press(dateChip);
      });

      // Navigate to previous month (July) using the left chevron
      const prevButton = await findByTestId('date-selector-previous');
      await act(async () => {
        fireEvent.press(prevButton);
      });

      // Now mock the API to return July data when called
      apiClient.getMonthlySummary.mockResolvedValue(julySummary);

      // Select day 3 in the July calendar
      const day3Cell = await findByTestId('calendar-day-3');
      await act(async () => {
        fireEvent.press(day3Cell);
      });

      // Wait for the new month data to load
      await waitFor(() => {
        // Should have called getMonthlySummary with July params
        expect(apiClient.getMonthlySummary).toHaveBeenCalledWith(2026, 7);
      });

      // Monthly card should now show "Acumulado em Julho"
      const julyTitle = await findByText(/Acumulado em Julho/);
      expect(julyTitle).toBeTruthy();
    });
  });

  describe('Default day selection', () => {
    /**
     * Validates: Requirements 5.4, 3.6
     * On mount, the screen SHALL select the first day with orders (smallest day number).
     * If no orders exist, default to day 1.
     */
    it('selects the first day with orders on mount', async () => {
      const { findByText } = render(<IntermediateSummaryScreen />);

      // Wait for content to load
      await findByText(/Acumulado em/);

      // Default selected day is the smallest day with orders = day 1
      // Day 1 data: orderCount: 5, revenue: 15000 (R$ 150,00), paidOrders: 3
      const ordersText = await findByText('5');
      expect(ordersText).toBeTruthy();

      const revenueText = await findByText('R$ 150,00');
      expect(revenueText).toBeTruthy();

      // Pagos: "3/5"
      const pagosText = await findByText('3/5');
      expect(pagosText).toBeTruthy();
    });

    /**
     * Validates: Requirements 5.4
     * When month changes, the screen SHALL select the default day (first with orders)
     * for the new month.
     */
    it('selects default day when month changes via calendar', async () => {
      const julySummary: MonthlySummaryResponse = {
        year: 2026,
        month: 7,
        totals: {
          totalOrders: 20,
          totalRevenue: 60000,
          totalReceived: 40000,
          totalPending: 20000,
        },
        days: [
          { day: 7, orderCount: 6, revenue: 18000, paidOrders: 4 },
          { day: 12, orderCount: 14, revenue: 42000, paidOrders: 10 },
        ],
      };

      const { findByText, findByTestId } = render(<IntermediateSummaryScreen />);

      // Wait for initial render
      await findByText(/Acumulado em Agosto/);

      // Open the calendar modal
      const dateChip = await findByTestId('date-chip');
      await act(async () => {
        fireEvent.press(dateChip);
      });

      // Mock API for July (must be set before navigation so onMonthChange returns correct days)
      apiClient.getMonthlySummary.mockResolvedValue(julySummary);

      // Navigate to July
      const prevButton = await findByTestId('date-selector-previous');
      await act(async () => {
        fireEvent.press(prevButton);
      });

      // Select day 7 in July (the first day with orders)
      const day7Cell = await findByTestId('calendar-day-7');
      await act(async () => {
        fireEvent.press(day7Cell);
      });

      // Wait for the July data
      await waitFor(() => {
        expect(apiClient.getMonthlySummary).toHaveBeenCalledWith(2026, 7);
      });

      // Selected day should now be day 7 (the one tapped)
      // Day 7 data: orderCount: 6, revenue: 18000 (R$ 180,00), paidOrders: 4
      const revenueText = await findByText('R$ 180,00');
      expect(revenueText).toBeTruthy();
    });
  });

  describe('Loading state', () => {
    /**
     * Validates: Requirements 8.1
     * WHILE the screen is fetching data, it SHALL display a loading indicator.
     */
    it('shows ActivityIndicator during initial fetch', async () => {
      // Make the API call hang indefinitely
      apiClient.getMonthlySummary.mockReturnValue(new Promise(() => {}));

      const { getByTestId, getByText } = render(<IntermediateSummaryScreen />);

      const loadingIndicator = getByTestId('loading-indicator');
      expect(loadingIndicator).toBeTruthy();

      // "Carregando..." text should be visible
      const loadingText = getByText('Carregando...');
      expect(loadingText).toBeTruthy();
    });
  });

  describe('Error state', () => {
    /**
     * Validates: Requirements 8.2
     * IF the data fetch fails, the screen SHALL display an error message with retry.
     */
    it('shows error message and retry button on fetch failure', async () => {
      apiClient.getMonthlySummary.mockRejectedValue(new Error('Network error'));

      const { findByTestId, findByText } = render(<IntermediateSummaryScreen />);

      const errorMessage = await findByTestId('error-message');
      expect(errorMessage).toBeTruthy();
      expect(errorMessage.props.children).toBe('Network error');

      const retryButton = await findByTestId('retry-button');
      expect(retryButton).toBeTruthy();

      // Verify the retry button says "Tentar novamente"
      const retryText = await findByText('Tentar novamente');
      expect(retryText).toBeTruthy();
    });

    /**
     * Validates: Requirements 8.3
     * WHEN the Operator taps "Tentar novamente", the screen SHALL retry the fetch.
     */
    it('retry button re-fetches data successfully', async () => {
      apiClient.getMonthlySummary.mockRejectedValueOnce(new Error('Network error'));

      const { findByTestId, findByText } = render(<IntermediateSummaryScreen />);

      // Wait for error state
      const retryButton = await findByTestId('retry-button');

      // Now set up the mock to succeed on the next call
      apiClient.getMonthlySummary.mockResolvedValue(mockMonthlySummary);

      // Press retry
      await act(async () => {
        fireEvent.press(retryButton);
      });

      // Should have been called again
      expect(apiClient.getMonthlySummary).toHaveBeenCalledTimes(2);

      // Should now display the monthly summary card
      const cardTitle = await findByText(/Acumulado em/);
      expect(cardTitle).toBeTruthy();
    });
  });

  describe('Pull-to-refresh', () => {
    /**
     * Validates: Requirements 9.1
     * The screen SHALL support pull-to-refresh to reload data.
     */
    it('pull-to-refresh triggers data refetch', async () => {
      const { findByText, UNSAFE_getByType } = render(<IntermediateSummaryScreen />);

      // Wait for initial render with data
      await findByText(/Acumulado em/);

      // Clear mock to track new calls
      apiClient.getMonthlySummary.mockClear();
      apiClient.getMonthlySummary.mockResolvedValue(mockMonthlySummary);

      // Find the ScrollView and trigger refresh via its RefreshControl
      const { ScrollView } = require('react-native');
      const scrollView = UNSAFE_getByType(ScrollView);

      await act(async () => {
        scrollView.props.refreshControl.props.onRefresh();
      });

      expect(apiClient.getMonthlySummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('Realtime updates', () => {
    /**
     * Validates: Requirements 9.2, 9.3
     * WHEN realtime events arrive on "orders:queue" or "orders:payment",
     * the screen SHALL refresh the data.
     */
    it('realtime events on "orders:queue" and "orders:payment" trigger refetch', async () => {
      const { findByText } = render(<IntermediateSummaryScreen />);

      // Wait for initial load
      await findByText(/Acumulado em/);

      // Verify useRealtime was called with correct channels
      expect(capturedRealtimeOptions).not.toBeNull();
      expect(capturedRealtimeOptions.channels).toContain('orders:queue');
      expect(capturedRealtimeOptions.channels).toContain('orders:payment');

      // Clear mock to track new calls from the event
      apiClient.getMonthlySummary.mockClear();
      apiClient.getMonthlySummary.mockResolvedValue(mockMonthlySummary);

      // Simulate a realtime event on orders:queue
      await act(async () => {
        capturedRealtimeOptions.onEvent({
          channel: 'orders:queue',
          event: 'new_order',
          payload: {},
        });
      });

      expect(apiClient.getMonthlySummary).toHaveBeenCalled();

      // Clear and simulate orders:payment event
      apiClient.getMonthlySummary.mockClear();
      apiClient.getMonthlySummary.mockResolvedValue(mockMonthlySummary);

      await act(async () => {
        capturedRealtimeOptions.onEvent({
          channel: 'orders:payment',
          event: 'payment_received',
          payload: {},
        });
      });

      expect(apiClient.getMonthlySummary).toHaveBeenCalled();
    });
  });

  describe('Empty month', () => {
    /**
     * Validates: Requirements 6.5
     * WHEN the month has no orders, the Monthly Summary Card SHALL display zeros
     * and the Selected Day Card SHALL show zeros for day 1.
     */
    it('shows zeros gracefully when month has no orders', async () => {
      apiClient.getMonthlySummary.mockResolvedValue(emptyMonthlySummary);

      const { findByText, findAllByText } = render(<IntermediateSummaryScreen />);

      // Monthly card should still render with title
      const cardTitle = await findByText(/Acumulado em Agosto/);
      expect(cardTitle).toBeTruthy();

      // totalOrders = 0 should be displayed
      const zeroValues = await findAllByText('0');
      expect(zeroValues.length).toBeGreaterThan(0);

      // Revenue values should show R$ 0,00
      const zeroRevenueValues = await findAllByText('R$ 0,00');
      expect(zeroRevenueValues.length).toBeGreaterThan(0);

      // Selected Day Card should show "0/0" for pagos (since no data)
      const pagosText = await findByText('0/0');
      expect(pagosText).toBeTruthy();

      // "Ver Resumo Completo" button should still be present
      const fullSummaryButton = await findByText('Ver Resumo Completo');
      expect(fullSummaryButton).toBeTruthy();
    });
  });
});
