import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ResetPasswordScreen } from '../../screens/ResetPasswordScreen';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

let mockSearchParams: Record<string, string | undefined> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

const mockConfirmPasswordReset = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    confirmPasswordReset: (...args: any[]) => mockConfirmPasswordReset(...args),
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

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ResetPasswordScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = { email: 'user@test.com' };
  });

  /**
   * Validates: Requirements 5.1
   * The App_Mobile SHALL provide a screen with the required fields for the
   * verification code, new password, and new password confirmation.
   */
  it('renders the code, new password, and confirmation fields', () => {
    const { getByTestId } = render(<ResetPasswordScreen />);

    expect(getByTestId('reset-password-code-input')).toBeTruthy();
    expect(getByTestId('reset-password-new-password-input')).toBeTruthy();
    expect(getByTestId('reset-password-confirm-password-input')).toBeTruthy();
    expect(getByTestId('reset-password-submit-button')).toBeTruthy();
  });

  /**
   * Validates: Requirements 5.6
   * IF the new password and its confirmation are not identical, THEN the
   * App_Mobile SHALL block submission (confirmPasswordReset is not called).
   */
  it('blocks submission when password and confirmation do not match', async () => {
    const { getByTestId, findByText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByTestId('reset-password-code-input'), '123456');
    fireEvent.changeText(getByTestId('reset-password-new-password-input'), 'password123');
    fireEvent.changeText(getByTestId('reset-password-confirm-password-input'), 'different123');
    fireEvent.press(getByTestId('reset-password-submit-button'));

    // A client-side error is shown and the API is never called.
    await findByText('As senhas não coincidem');
    expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
  });

  /**
   * Validates: Requirements 7.4
   * The App_Mobile SHALL validate the new password length (8–72 chars) before
   * sending the reset request and block submission when the length is invalid.
   */
  it('blocks submission when the password is shorter than 8 characters', async () => {
    const { getByTestId } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByTestId('reset-password-code-input'), '123456');
    fireEvent.changeText(getByTestId('reset-password-new-password-input'), 'short');
    fireEvent.changeText(getByTestId('reset-password-confirm-password-input'), 'short');
    fireEvent.press(getByTestId('reset-password-submit-button'));

    await waitFor(() => {
      expect(mockConfirmPasswordReset).not.toHaveBeenCalled();
    });
  });

  /**
   * Validates: Requirements 5.5
   * WHEN the password update completes successfully, the App_Mobile SHALL show
   * a success confirmation and navigate the user to the login screen.
   */
  it('shows confirmation and navigates to /login on success', async () => {
    mockConfirmPasswordReset.mockResolvedValue(undefined);
    const { getByTestId } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByTestId('reset-password-code-input'), '123456');
    fireEvent.changeText(getByTestId('reset-password-new-password-input'), 'password123');
    fireEvent.changeText(getByTestId('reset-password-confirm-password-input'), 'password123');
    fireEvent.press(getByTestId('reset-password-submit-button'));

    await waitFor(() => {
      expect(mockConfirmPasswordReset).toHaveBeenCalledWith(
        'user@test.com',
        '123456',
        'password123',
      );
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/login');
    });
  });

  /**
   * Validates: Requirements 5.7 (surfaced in UI)
   * On a backend rejection, the App_Mobile SHALL show the pt-BR error message
   * and remain on the screen (no navigation to login).
   */
  it('shows the backend error message on a failed reset', async () => {
    mockConfirmPasswordReset.mockRejectedValue(new Error('Código inválido ou expirado'));
    const { getByTestId, findByText } = render(<ResetPasswordScreen />);

    fireEvent.changeText(getByTestId('reset-password-code-input'), '123456');
    fireEvent.changeText(getByTestId('reset-password-new-password-input'), 'password123');
    fireEvent.changeText(getByTestId('reset-password-confirm-password-input'), 'password123');
    fireEvent.press(getByTestId('reset-password-submit-button'));

    await findByText('Código inválido ou expirado');
    expect(mockReplace).not.toHaveBeenCalledWith('/login');
  });
});
