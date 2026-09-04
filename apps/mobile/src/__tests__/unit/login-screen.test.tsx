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

  it('shows the invalid-credentials message on a 401 login failure', async () => {
    mockLogin.mockRejectedValue(new Error('E-mail ou senha incorretos'));
    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('login-email-input'), 'user@test.com');
    fireEvent.changeText(getByTestId('login-password-input'), 'wrongpass');
    fireEvent.press(getByTestId('login-submit-button'));

    await findByText('E-mail ou senha incorretos');
  });

  it('shows a connection error message when the request cannot reach the server', async () => {
    mockLogin.mockRejectedValue(
      new Error('Não foi possível conectar ao servidor. Verifique sua conexão e o endereço da API.'),
    );
    const { getByTestId, findByText } = render(<LoginScreen />);

    fireEvent.changeText(getByTestId('login-email-input'), 'user@test.com');
    fireEvent.changeText(getByTestId('login-password-input'), 'password123');
    fireEvent.press(getByTestId('login-submit-button'));

    await findByText('Não foi possível conectar ao servidor. Verifique sua conexão e o endereço da API.');
  });

  // ─── "Esqueceu sua senha?" entry point (Requisito 1) ───────────────────────

  describe('forgot-password entry point', () => {
    // R1.1 — o controle acionável "Esqueceu sua senha?" é exibido na tela de login.
    it('renders the "Esqueceu sua senha?" control', () => {
      const { getByTestId, getByText } = render(<LoginScreen />);

      expect(getByTestId('login-forgot-password-link')).toBeTruthy();
      expect(getByText('Esqueceu sua senha?')).toBeTruthy();
    });

    // R1.2 — ao acionar o controle, navega para a tela de solicitação de código.
    it('navigates to /forgot-password when the control is pressed', () => {
      const { getByTestId } = render(<LoginScreen />);

      fireEvent.press(getByTestId('login-forgot-password-link'));

      expect(mockPush).toHaveBeenCalledWith('/forgot-password');
    });

    // R1.4 — se a navegação falhar, permanece na tela de login e exibe a mensagem de erro.
    it('stays on the login screen and shows an error when navigation fails', async () => {
      mockPush.mockImplementationOnce(() => {
        throw new Error('navigation failed');
      });
      const { getByTestId, findByTestId } = render(<LoginScreen />);

      fireEvent.press(getByTestId('login-forgot-password-link'));

      // Permanece na tela de login: o formulário continua presente.
      expect(getByTestId('login-submit-button')).toBeTruthy();

      // Exibe a mensagem de erro de navegação (R1.4).
      const error = await findByTestId('login-forgot-password-error');
      expect(error).toBeTruthy();
    });
  });
});
