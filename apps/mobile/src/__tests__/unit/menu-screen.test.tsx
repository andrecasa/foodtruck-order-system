import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MenuScreen } from '../../screens/MenuScreen';
import type { MenuItem } from '@order-system/shared';

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

const mockGetAllMenuItems = jest.fn<Promise<MenuItem[]>, any[]>();
const mockToggleMenuItemStatus = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getAllMenuItems: (...args: any[]) => mockGetAllMenuItems(...args),
    toggleMenuItemStatus: (...args: any[]) => mockToggleMenuItemStatus(...args),
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

function createMenuItems(): MenuItem[] {
  return [
    {
      id: 'item-1',
      name: 'Pastel de Carne',
      category: 'Pastéis',
      price: 800,
      status: 'ativo',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: 'item-2',
      name: 'Caldo de Cana',
      category: 'Bebidas',
      price: 600,
      status: 'ativo',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
  ];
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MenuScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders menu items list', async () => {
    mockGetAllMenuItems.mockResolvedValue(createMenuItems());

    const { findByText } = render(<MenuScreen />);

    await findByText('Pastel de Carne');
    await findByText('Caldo de Cana');
    await findByText('Pastéis');
    await findByText('Bebidas');
  });

  it('navigates to create item on add button press', async () => {
    mockGetAllMenuItems.mockResolvedValue(createMenuItems());

    const { findByText, findByLabelText } = render(<MenuScreen />);

    await findByText('Pastel de Carne');

    const addButton = await findByLabelText('Adicionar');
    fireEvent.press(addButton);

    expect(mockPush).toHaveBeenCalledWith('/create-menu-item');
  });

  it('toggles item status', async () => {
    const items = createMenuItems();
    mockGetAllMenuItems.mockResolvedValue(items);
    mockToggleMenuItemStatus.mockResolvedValue({ ...items[0], status: 'inativo' });

    const { findByTestId } = render(<MenuScreen />);

    const toggle = await findByTestId('toggle-menu-item-item-1');
    fireEvent(toggle, 'valueChange', false);

    await waitFor(() => {
      expect(mockToggleMenuItemStatus).toHaveBeenCalledWith('item-1');
    });
  });
});
