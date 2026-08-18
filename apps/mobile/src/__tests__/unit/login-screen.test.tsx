import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LoginScreen } from '../../screens/LoginScreen';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
}));

const mockLogin = jest.fn();

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    user: null,
    isLoading: false,
    isAuthenticated: false,
    logout: jest.fn(),
  }),
  AuthProvider: ({ children }: any) => children,
}));

jest.mock('../../services/api-client', () => ({
  apiClient: {},
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders login form with email and password inputs', () => {
    const { getByTestId, getByText } = render(<LoginScreen />);

    expect(getByTestId('login-email-input')).toBeTruthy();
    expect(getByTestId('login-password-input')).toBeTruthy();
    expect(getByTestId('login-submit-button')).toBeTruthy();
    expect(getByText('Faça login para continuar')).toBeTruthy();
  });

  it('shows validation errors when submitting empty form', async () => {
    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.press(getByTestId('login-submit-button'));

    await findByText('E-mail é obrigatório');
    await findByText('Senha é obrigatória');
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('calls login on valid submit', async () => {
    mockLogin.mockResolvedValue(undefined);
    const { getByTestId } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('login-email-input'), 'user@test.com');
    fireEvent.changeText(getByTestId('login-password-input'), 'password123');
    fireEvent.press(getByTestId('login-submit-button'));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('user@test.com', 'password123');
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
    });
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'));
    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('login-email-input'), 'user@test.com');
    fireEvent.changeText(getByTestId('login-password-input'), 'wrongpass');
    fireEvent.press(getByTestId('login-submit-button'));

    await findByText('E-mail ou senha incorretos');
  });
});
