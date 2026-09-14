import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { CreateOrderScreen } from '../../screens/CreateOrderScreen';
import type { MenuItem } from '@order-system/shared';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

// Guarda o estado do `useFocusEffect` para podermos simular um novo foco da tela
// (retorno do fluxo de confirmação/pagamento), já que a instância continua
// montada por baixo das telas empilhadas. `mockRefocus()` re-executa o efeito.
// Nomes prefixados com `mock` são permitidos dentro do factory do `jest.mock`.
const mockFocusState: {
  cb: (() => void | (() => void)) | null;
  cleanup: void | (() => void);
} = { cb: null, cleanup: undefined };

function mockRefocus(): void {
  if (typeof mockFocusState.cleanup === 'function') mockFocusState.cleanup();
  mockFocusState.cleanup = mockFocusState.cb?.();
}

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
  // Mock local (em vez do helper compartilhado) para permitir re-disparar o
  // foco via `mockRefocus()` e validar o reset do carrinho ao retornar à tela.
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require('react');
    mockFocusState.cb = cb;
    useEffect(() => {
      mockFocusState.cleanup = cb();
      return () => {
        if (typeof mockFocusState.cleanup === 'function') mockFocusState.cleanup();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

jest.mock('../../hooks/useRealtime', () => ({
  useRealtime: jest.fn(() => ({ status: 'connected' })),
}));

const mockGetMenu = jest.fn<Promise<MenuItem[]>, any[]>();
const mockCreateOrder = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getMenu: (...args: any[]) => mockGetMenu(...args),
    createOrder: (...args: any[]) => mockCreateOrder(...args),
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

describe('CreateOrderScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusState.cb = null;
    mockFocusState.cleanup = undefined;
  });

  it('renders with origin selector and menu items', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    // Origin selector
    expect(getByTestId('origin-selector')).toBeTruthy();

    // Menu items rendered after loading
    await findByText('Pastel de Carne');
    await findByText('Caldo de Cana');
  });

  it('can increment/decrement item quantities', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // At qty 0 the item shows "Adicionar"; tapping it adds the first unit.
    fireEvent.press(getByTestId('add-item-1'));
    // Now the stepper is visible.
    fireEvent.press(getByTestId('increment-item-1'));

    // Decrement
    fireEvent.press(getByTestId('decrement-item-1'));

    // After +2 -1, quantity should be 1 — verify via text '1'
    await findByText('1');
  });

  it('shows total price updates when items change', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // Add pastel (R$ 8,00) then increment → total = R$ 16,00
    fireEvent.press(getByTestId('add-item-1'));
    fireEvent.press(getByTestId('increment-item-1'));

    await findByText('R$ 16,00');
  });

  it('does not navigate to confirm when no item is selected (CTA disabled)', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // With an empty selection the "Revisar Pedido" CTA is disabled, so pressing
    // it does not navigate to the confirm step.
    expect(getByTestId('submit-order').props.accessibilityState.disabled).toBe(true);
    fireEvent.press(getByTestId('submit-order'));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('navigates to confirm with the selected items and origin (name asked later)', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // Add item (shows "Adicionar" at qty 0)
    fireEvent.press(getByTestId('add-item-1'));

    // Review → navigates to the confirm step. The name is requested there, so
    // this screen no longer calls createOrder directly.
    fireEvent.press(getByTestId('submit-order'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/confirm-order',
        params: {
          items: JSON.stringify([{ menuItemId: 'item-1', quantity: 1 }]),
          origin: 'presencial',
        },
      });
    });

    // The order is only created on the confirm screen.
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it('reseta o carrinho ao reganhar foco após enviar o pedido para revisão', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId, queryByText } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // Seleciona 2 unidades do item → total R$ 16,00.
    fireEvent.press(getByTestId('add-item-1'));
    fireEvent.press(getByTestId('increment-item-1'));
    await findByText('R$ 16,00');

    // Envia para revisão (marca reviewInProgress internamente).
    fireEvent.press(getByTestId('submit-order'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());

    // Simula o retorno à tela (AppBar/Confirmar/Pular) reganhando o foco.
    await act(async () => {
      mockRefocus();
    });

    // O carrinho foi zerado: total volta a R$ 0,00 e o CTA fica desabilitado,
    // ou seja, o próximo "Novo Pedido" não herda os itens anteriores.
    await waitFor(() => {
      expect(queryByText('R$ 16,00')).toBeNull();
    });
    await findByText('R$ 0,00');
    expect(getByTestId('submit-order').props.accessibilityState.disabled).toBe(true);
  });

  it('mantém o carrinho ao reganhar foco sem ter ido para revisão', async () => {
    mockGetMenu.mockResolvedValue(createMenuItems());

    const { findByText, getByTestId } = render(<CreateOrderScreen />);

    await findByText('Pastel de Carne');

    // Seleciona um item mas NÃO envia para revisão.
    fireEvent.press(getByTestId('add-item-1'));
    fireEvent.press(getByTestId('increment-item-1'));
    await findByText('R$ 16,00');

    // Reganhar foco (ex.: após editar cardápio) não deve limpar o carrinho.
    await act(async () => {
      mockRefocus();
    });

    await findByText('R$ 16,00');
    expect(getByTestId('submit-order').props.accessibilityState.disabled).toBe(false);
  });
});
