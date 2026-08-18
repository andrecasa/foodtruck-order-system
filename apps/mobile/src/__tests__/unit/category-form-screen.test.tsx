import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CategoryFormScreen } from '../../screens/CategoryFormScreen';

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
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

const mockCreateCategory = jest.fn();
const mockUpdateCategory = jest.fn();
const mockDeleteCategory = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    createCategory: (...args: any[]) => mockCreateCategory(...args),
    updateCategory: (...args: any[]) => mockUpdateCategory(...args),
    deleteCategory: (...args: any[]) => mockDeleteCategory(...args),
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

describe('CategoryFormScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders category form', () => {
    const { getByTestId, getByText } = render(<CategoryFormScreen />);

    expect(getByTestId('input-category-name')).toBeTruthy();
    expect(getByTestId('submit-category')).toBeTruthy();
    expect(getByText('Nome')).toBeTruthy();
  });

  it('validates name field', async () => {
    const { getByTestId, findByText } = render(<CategoryFormScreen />);

    // Submit with empty name
    fireEvent.press(getByTestId('submit-category'));

    await findByText('Nome é obrigatório');
    expect(mockCreateCategory).not.toHaveBeenCalled();
  });

  it('saves category in create mode', async () => {
    mockCreateCategory.mockResolvedValue({ id: 'new-cat' });

    const { getByTestId } = render(<CategoryFormScreen />);

    fireEvent.changeText(getByTestId('input-category-name'), 'Sobremesas');
    fireEvent.press(getByTestId('submit-category'));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith({ name: 'Sobremesas' });
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('saves category in edit mode', async () => {
    mockUpdateCategory.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <CategoryFormScreen id="cat-1" name="Pastéis Salgados" />,
    );

    // Verify pre-filled
    expect(getByTestId('input-category-name').props.value).toBe('Pastéis Salgados');

    // Change name
    fireEvent.changeText(getByTestId('input-category-name'), 'Pastéis Doces');
    fireEvent.press(getByTestId('submit-category'));

    await waitFor(() => {
      expect(mockUpdateCategory).toHaveBeenCalledWith('cat-1', { name: 'Pastéis Doces' });
    });
  });
});
