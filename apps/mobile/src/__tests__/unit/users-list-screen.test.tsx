import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { UsersListScreen } from '../../screens/UsersListScreen';
import type { User } from '../../types/user';

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
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

const mockListUsers = jest.fn();
const mockToggleUserStatus = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    listUsers: (...args: any[]) => mockListUsers(...args),
    toggleUserStatus: (...args: any[]) => mockToggleUserStatus(...args),
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

function createUsers(): User[] {
  return [
    {
      id: 'user-1',
      name: 'Maria Admin',
      email: 'maria@test.com',
      role: 'admin',
      status: 'ativo',
      createdAt: '2024-01-10T10:00:00Z',
    },
    {
      id: 'user-2',
      name: 'João Atendente',
      email: 'joao@test.com',
      role: 'atendente',
      status: 'ativo',
      createdAt: '2024-01-11T10:00:00Z',
    },
    {
      id: 'user-3',
      name: 'Pedro Preparador',
      email: 'pedro@test.com',
      role: 'preparador',
      status: 'ativo',
      createdAt: '2024-01-12T10:00:00Z',
    },
  ] as User[];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('UsersListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders user list', async () => {
    mockListUsers.mockResolvedValue({ users: createUsers() });

    const { findByText } = render(<UsersListScreen />);

    await findByText('Maria Admin');
    await findByText('João Atendente');
    await findByText('Pedro Preparador');
  });

  it('shows filter chips for roles', async () => {
    mockListUsers.mockResolvedValue({ users: createUsers() });

    const { findByTestId } = render(<UsersListScreen />);

    // FilterChips renders with testID="user-filter"
    await findByTestId('user-filter');
    await findByTestId('user-filter-admin');
    await findByTestId('user-filter-atendente');
    await findByTestId('user-filter-preparador');
  });

  it('navigates to user detail on card press', async () => {
    mockListUsers.mockResolvedValue({ users: createUsers() });

    const { findByTestId } = render(<UsersListScreen />);

    const userCard = await findByTestId('user-card-user-1');
    fireEvent.press(userCard);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/user-detail',
      params: { id: 'user-1' },
    });
  });
});
