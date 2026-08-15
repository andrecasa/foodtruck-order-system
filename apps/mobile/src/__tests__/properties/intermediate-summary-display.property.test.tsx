import React from 'react';
import * as fc from 'fast-check';
import { render } from '@testing-library/react-native';
import { IntermediateSummaryScreen } from '../../screens/IntermediateSummaryScreen';
import { formatPrice, getPortugueseMonthName } from '../../utils/format';
import type { MonthlySummaryResponse } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
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

// ─── Test ───────────────────────────────────────────────────────────────────

/**
 * Feature: summary-intermediate-screen, Property 3: Intermediate screen displays all required accumulated totals
 *
 * For any valid MonthlySummaryResponse data, the IntermediateSummaryScreen renders the
 * monthly accumulated totals (totalOrders, totalRevenue, totalReceived, totalPending)
 * formatted correctly within the MonthlySummaryCard.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
 */
describe('Property 3: Intermediate screen displays all required accumulated totals', () => {
  const { apiClient } = require('../../services/api-client');

  const monthlySummaryArb = fc.record({
    year: fc.integer({ min: 2020, max: 2030 }),
    month: fc.integer({ min: 1, max: 12 }),
    totals: fc.record({
      totalOrders: fc.integer({ min: 0, max: 9999 }),
      totalRevenue: fc.integer({ min: 0, max: 99_999_999 }),
      totalReceived: fc.integer({ min: 0, max: 99_999_999 }),
      totalPending: fc.integer({ min: 0, max: 99_999_999 }),
    }),
    days: fc.array(
      fc.record({
        day: fc.integer({ min: 1, max: 28 }),
        orderCount: fc.integer({ min: 1, max: 100 }),
        revenue: fc.integer({ min: 100, max: 99_999_999 }),
        paidOrders: fc.integer({ min: 0, max: 100 }),
      }),
      { minLength: 1, maxLength: 5 }
    ),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the monthly summary card with correct month name and formatted totals for any valid MonthlySummaryResponse', async () => {
    await fc.assert(
      fc.asyncProperty(monthlySummaryArb, async (summary: MonthlySummaryResponse) => {
        // Mock API to return the generated summary
        apiClient.getMonthlySummary.mockResolvedValue(summary);

        const { findByText, unmount } = render(<IntermediateSummaryScreen />);

        // Wait for the monthly summary card to render with the month name
        const monthName = getPortugueseMonthName(summary.month);
        const cardTitle = await findByText(`Acumulado em ${monthName}`);
        expect(cardTitle).toBeTruthy();

        // Verify formatted revenue is displayed
        const expectedRevenue = formatPrice(summary.totals.totalRevenue);
        const revenueEl = await findByText(expectedRevenue);
        expect(revenueEl).toBeTruthy();

        // Verify formatted received is displayed
        const expectedReceived = formatPrice(summary.totals.totalReceived);
        const receivedEl = await findByText(expectedReceived);
        expect(receivedEl).toBeTruthy();

        // Verify formatted pending is displayed
        const expectedPending = formatPrice(summary.totals.totalPending);
        const pendingEl = await findByText(expectedPending);
        expect(pendingEl).toBeTruthy();

        unmount();
      }),
      { numRuns: 20 }
    );
  }, 60_000);
});
