import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { RequestCodeScreen } from '../../screens/RequestCodeScreen';

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

const mockRequestPasswordReset = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
  },
}));

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RequestCodeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // R2.1 — a tela fornece um campo de e-mail e um controle de envio.
  it('renders the email field and the "Enviar código" submit button', () => {
    const { getByTestId, getByText } = render(<RequestCodeScreen />);

    expect(getByTestId('request-code-email-input')).toBeTruthy();
    expect(getByTestId('request-code-submit-button')).toBeTruthy();
    expect(getByText('Enviar código')).toBeTruthy();
  });

  // R2.1 — não envia com e-mail vazio (validação client-side) e não chama a API.
  it('shows a validation error and does not call the API when the email is empty', async () => {
    const { getByTestId, findByText } = render(<RequestCodeScreen />);

    fireEvent.press(getByTestId('request-code-submit-button'));

    await findByText('E-mail é obrigatório');
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // R2.2 — ao enviar um e-mail válido, chama requestPasswordReset com o e-mail,
  // exibe a Mensagem_Neutra e navega para a tela de redefinição.
  it('calls requestPasswordReset with the entered email and navigates on submit', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    const { getByTestId } = render(<RequestCodeScreen />);

    fireEvent.changeText(getByTestId('request-code-email-input'), 'user@test.com');
    fireEvent.press(getByTestId('request-code-submit-button'));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@test.com');
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/reset-password',
        params: { email: 'user@test.com' },
      });
    });

    // Mensagem_Neutra exibida após o envio (R2.2).
    expect(getByTestId('request-code-message')).toBeTruthy();
  });

  // R2.2 — o e-mail informado é normalizado (trim) antes de ser enviado.
  it('trims the email before calling requestPasswordReset', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    const { getByTestId } = render(<RequestCodeScreen />);

    fireEvent.changeText(getByTestId('request-code-email-input'), '  user@test.com  ');
    fireEvent.press(getByTestId('request-code-submit-button'));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith('user@test.com');
    });
  });
});
