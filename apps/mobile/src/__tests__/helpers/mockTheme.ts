/**
 * Centralized theme mock for tests.
 * Use in jest.mock() calls to avoid duplicating theme config in every test file.
 */
export const mockTheme = {
  businessName: 'Test Business',
  logo: '',
  colors: {
    primary: '#7B2D2D',
    secondary: '#D4812B',
    background: '#FDF8F4',
    text: '#3D2020',
    textSecondary: '#8B6B5A',
    surface: '#FFFFFF',
    divider: '#E8DDD5',
    error: '#B54040',
    success: '#5A8C5A',
    warning: '#D4812B',
    aguardando: '#D4812B',
    preparando: '#5B8BA8',
    pronto: '#5A8C5A',
    received: '#2E7D32',
    pending: '#C62828',
    revenue: '#D4812B',
    surfacePrimary: '#FDF8F4',
    surfaceRevenue: '#FFF8F0',
    surfaceReceived: '#F0F8F0',
    surfacePending: '#FEF2F2',
  },
  typography: {
    fontFamily: 'Inter',
    sizes: { xs: 10, sm: 12, md: 14, lg: 16, xl: 20, xxl: 32 },
    weights: { regular: 400, medium: 500, bold: 600 },
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  borderRadius: { sm: 8, md: 12, lg: 24, full: 9999 },
};

/**
 * Creates jest.mock() calls for both theme modules.
 * Usage: Add these two lines at the top of your test file:
 *   jest.mock('../../theme', () => createThemeMock());
 *   jest.mock('../../theme/ThemeProvider', () => createThemeMock());
 */
export function createThemeMock() {
  return {
    useTheme: () => mockTheme,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    defaultTheme: mockTheme,
    loadTheme: () => mockTheme,
  };
}

/**
 * Pre-built mock object for jest.mock().
 * Usage:
 *   import { themeMocks } from '../helpers/mockTheme';
 *   jest.mock('../../theme', () => themeMocks);
 *   jest.mock('../../theme/ThemeProvider', () => themeMocks);
 */
export const themeMocks = {
  useTheme: () => mockTheme,
  ThemeProvider: ({ children }: any) => children,
  defaultTheme: mockTheme,
  loadTheme: () => mockTheme,
};
