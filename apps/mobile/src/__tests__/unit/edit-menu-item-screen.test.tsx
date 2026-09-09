import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { EditMenuItemScreen } from '../../screens/EditMenuItemScreen';

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
const mockUpdateMenuItem = jest.fn();
const mockDeleteMenuItem = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getCategories: (...args: any[]) => mockGetCategories(...args),
    updateMenuItem: (...args: any[]) => mockUpdateMenuItem(...args),
    deleteMenuItem: (...args: any[]) => mockDeleteMenuItem(...args),
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

describe('EditMenuItemScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCategories.mockResolvedValue([
      { id: 'cat-1', name: 'Pastéis', sortOrder: 0, status: 'ativo', itemCount: 5, createdAt: '' },
      { id: 'cat-2', name: 'Bebidas', sortOrder: 1, status: 'ativo', itemCount: 3, createdAt: '' },
    ]);
  });

  it('renders form pre-filled with item data', async () => {
    const { getByTestId } = render(
      <EditMenuItemScreen id="item-1" name="Pastel de Carne" price={800} category="Pastéis" />,
    );

    // Wait for the async categories load + setState to settle inside act()
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalled());

    const nameInput = getByTestId('input-item-name');
    expect(nameInput.props.value).toBe('Pastel de Carne');

    const priceInput = getByTestId('input-item-price');
    // Price 800 centavos → formatted as "8,00"
    expect(priceInput.props.value).toBe('8,00');
  });

  it('saves updated item', async () => {
    mockUpdateMenuItem.mockResolvedValue(undefined);

    const { getByTestId } = render(
      <EditMenuItemScreen id="item-1" name="Pastel de Carne" price={800} category="Pastéis" />,
    );

    // Wait for the initial async categories load to settle before interacting
    await waitFor(() => expect(mockGetCategories).toHaveBeenCalled());

    // Change the name
    fireEvent.changeText(getByTestId('input-item-name'), 'Pastel de Frango');

    // Submit
    fireEvent.press(getByTestId('submit-menu-item'));

    await waitFor(() => {
      expect(mockUpdateMenuItem).toHaveBeenCalledWith('item-1', {
        name: 'Pastel de Frango',
      });
    });

    // Após salvar, volta imediatamente ao cardápio (sem tela intermediária de sucesso)
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('exclui o item e volta ao cardápio', async () => {
    mockDeleteMenuItem.mockResolvedValue(undefined);

    const { getByTestId, getAllByLabelText } = render(
      <EditMenuItemScreen id="item-1" name="Pastel de Carne" price={800} category="Pastéis" />,
    );

    await waitFor(() => expect(mockGetCategories).toHaveBeenCalled());

    // Abre o modal de exclusão (o gatilho e o botão de confirmar compartilham o rótulo "Excluir")
    fireEvent.press(getByTestId('delete-menu-item'));

    // Confirma na modal: o botão de confirmação é o último rótulo "Excluir" renderizado
    const excluirButtons = getAllByLabelText('Excluir');
    fireEvent.press(excluirButtons[excluirButtons.length - 1]!);

    await waitFor(() => {
      expect(mockDeleteMenuItem).toHaveBeenCalledWith('item-1');
    });

    // Após excluir, volta imediatamente ao cardápio (sem tela intermediária de sucesso)
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });
});
