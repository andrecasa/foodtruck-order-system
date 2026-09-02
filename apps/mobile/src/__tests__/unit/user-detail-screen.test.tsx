import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { UserDetailScreen } from '../../screens/UserDetailScreen';

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
  useLocalSearchParams: () => ({ id: 'user-1' }),
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

const mockGetUserById = jest.fn();
const mockUpdateUser = jest.fn();
const mockResetPassword = jest.fn();
const mockToggleUserStatus = jest.fn();
const mockDeleteUser = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getUserById: (...args: any[]) => mockGetUserById(...args),
    updateUser: (...args: any[]) => mockUpdateUser(...args),
    resetPassword: (...args: any[]) => mockResetPassword(...args),
    toggleUserStatus: (...args: any[]) => mockToggleUserStatus(...args),
    deleteUser: (...args: any[]) => mockDeleteUser(...args),
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function createUser() {
  return {
    id: 'user-1',
    name: 'Maria Admin',
    email: 'maria@test.com',
    role: 'admin' as const,
    status: 'ativo' as const,
    createdAt: '2024-01-10T10:00:00Z',
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UserDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders user information', async () => {
    mockGetUserById.mockResolvedValue(createUser());

    const { findByText, findByTestId } = render(<UserDetailScreen />);

    await findByText('Maria Admin');
    await findByText('maria@test.com');
    await findByTestId('user-info-card');
  });

  it('saves updated user', async () => {
    mockGetUserById.mockResolvedValue(createUser());
    mockUpdateUser.mockResolvedValue(undefined);

    const { findByTestId, getByTestId } = render(<UserDetailScreen />);

    // Wait for user data to load
    await findByTestId('user-info-card');

    // Change the name
    fireEvent.changeText(getByTestId('input-name'), 'Maria Updated');

    // Submit
    fireEvent.press(getByTestId('submit-user'));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith('user-1', { name: 'Maria Updated' });
    });
  });
});
