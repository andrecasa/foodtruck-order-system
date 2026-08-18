import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { UserFormScreen } from '../../screens/UserFormScreen';

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
  useLocalSearchParams: () => ({}), // Create mode (no id)
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

const mockCreateUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetUserById = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    createUser: (...args: any[]) => mockCreateUser(...args),
    updateUser: (...args: any[]) => mockUpdateUser(...args),
    getUserById: (...args: any[]) => mockGetUserById(...args),
    deleteUser: (...args: any[]) => mockDeleteUser(...args),
  },
}));

jest.mock('../../components/DrawerMenu', () => ({
  DrawerMenu: () => null,
}));

jest.mock('../../components/BottomNav', () => ({
  BottomNav: () => null,
}));

jest.mock('../../theme', () => ({
  ...require('../helpers/mockTheme').themeMocks,
  deepMergeTheme: (base: any) => base,
}));

jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UserFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders create user form', () => {
    const { getByTestId, getByText } = render(<UserFormScreen />);

    expect(getByTestId('select-role')).toBeTruthy();
    expect(getByTestId('input-name')).toBeTruthy();
    expect(getByTestId('input-email')).toBeTruthy();
    expect(getByTestId('input-password')).toBeTruthy();
    expect(getByTestId('input-confirm-password')).toBeTruthy();
    expect(getByText('Função')).toBeTruthy();
    expect(getByText('Nome')).toBeTruthy();
    expect(getByText('E-mail')).toBeTruthy();
    expect(getByText('Senha')).toBeTruthy();
  });

  it('validates required fields', async () => {
    const { getByTestId, findByText } = render(<UserFormScreen />);

    // Submit without filling anything
    fireEvent.press(getByTestId('submit-user'));

    await findByText('Função é obrigatória');
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('submits new user', async () => {
    mockCreateUser.mockResolvedValue({ id: 'user-new' });

    const { getByTestId, findByText } = render(<UserFormScreen />);

    // Select role
    fireEvent.press(getByTestId('select-role'));
    const adminOption = await findByText('Admin');
    fireEvent.press(adminOption);

    // Fill name
    fireEvent.changeText(getByTestId('input-name'), 'Novo Usuário');

    // Fill email
    fireEvent.changeText(getByTestId('input-email'), 'novo@test.com');

    // Fill password
    fireEvent.changeText(getByTestId('input-password'), 'password123');

    // Fill confirm password
    fireEvent.changeText(getByTestId('input-confirm-password'), 'password123');

    // Submit
    fireEvent.press(getByTestId('submit-user'));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        name: 'Novo Usuário',
        email: 'novo@test.com',
        password: 'password123',
        role: 'admin',
      });
    });
  });
});
