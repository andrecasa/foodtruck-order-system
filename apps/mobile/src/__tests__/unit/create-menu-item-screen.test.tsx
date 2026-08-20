import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CreateMenuItemScreen } from '../../screens/CreateMenuItemScreen';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

const mockGetCategories = jest.fn();
const mockCreateMenuItem = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getCategories: (...args: any[]) => mockGetCategories(...args),
    createMenuItem: (...args: any[]) => mockCreateMenuItem(...args),
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

describe('CreateMenuItemScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCategories.mockResolvedValue([
      { id: 'cat-1', name: 'Pastéis', sortOrder: 0, status: 'ativo', itemCount: 5, createdAt: '' },
      { id: 'cat-2', name: 'Bebidas', sortOrder: 1, status: 'ativo', itemCount: 3, createdAt: '' },
    ]);
  });

  it('renders form with name, price, category fields', async () => {
    const { getByTestId, findByText } = render(<CreateMenuItemScreen />);

    expect(getByTestId('input-item-name')).toBeTruthy();
    expect(getByTestId('input-item-price')).toBeTruthy();
    expect(getByTestId('select-category')).toBeTruthy();
    await findByText('Categoria');
    await findByText('Nome do item');
    await findByText('Preço');
  });

  it('validates required fields', async () => {
    const { getByTestId, findByText } = render(<CreateMenuItemScreen />);

    // Submit without filling anything
    fireEvent.press(getByTestId('submit-menu-item'));

    await findByText('Selecione uma categoria');
  });

  it('submits new menu item', async () => {
    mockCreateMenuItem.mockResolvedValue({ id: 'new-item-1' });

    const { getByTestId, findByText } = render(<CreateMenuItemScreen />);

    // Wait for categories to load
    await waitFor(() => {
      expect(mockGetCategories).toHaveBeenCalled();
    });

    // Select category
    fireEvent.press(getByTestId('select-category'));
    const categoryOption = await findByText('Pastéis');
    fireEvent.press(categoryOption);

    // Fill name
    fireEvent.changeText(getByTestId('input-item-name'), 'Pastel de Frango');

    // Fill price (type digits, formatted as currency)
    fireEvent.changeText(getByTestId('input-item-price'), '1000');

    // Submit
    fireEvent.press(getByTestId('submit-menu-item'));

    await waitFor(() => {
      expect(mockCreateMenuItem).toHaveBeenCalledWith({
        name: 'Pastel de Frango',
        price: 1000,
        category: 'Pastéis',
      });
    });
  });
});
