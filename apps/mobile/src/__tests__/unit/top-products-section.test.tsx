import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import type { Category, TopProductsResponse } from '@order-system/shared';
import { TopProductsSection } from '../../components/TopProductsSection';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetCategories = jest.fn();

jest.mock('../../services/api-client', () => ({
  apiClient: {
    getCategories: (...args: any[]) => mockGetCategories(...args),
  },
}));

jest.mock('../../theme', () => require('../helpers/mockTheme').themeMocks);
jest.mock('../../theme/ThemeProvider', () => require('../helpers/mockTheme').themeMocks);

// ─── Helpers ────────────────────────────────────────────────────────────────

const CAT_1 = '11111111-1111-4111-8111-111111111111';
const CAT_2 = '22222222-2222-4222-8222-222222222222';

function createCategory(id: string, name: string, status: 'ativo' | 'inativo' = 'ativo'): Category {
  return { id, name, sortOrder: 0, status, itemCount: 3, createdAt: '2024-01-01T00:00:00.000Z' };
}

function createResponse(overrides: Partial<TopProductsResponse> = {}): TopProductsResponse {
  return {
    products: [
      { menuItemId: 'mi-1', name: 'Pastel de Carne', categoryId: CAT_1, quantitySold: 42, revenueCents: 21000 },
      { menuItemId: 'mi-2', name: 'Coxinha', categoryId: CAT_2, quantitySold: 30, revenueCents: 12000 },
    ],
    categoryIds: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('TopProductsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCategories.mockResolvedValue([createCategory(CAT_1, 'Salgados'), createCategory(CAT_2, 'Bebidas')]);
  });

  it('renderiza o ranking de produtos retornado pelo fetch', async () => {
    const fetchTopProducts = jest.fn().mockResolvedValue(createResponse());

    const { findByText, findByTestId } = render(
      <TopProductsSection fetchTopProducts={fetchTopProducts} periodKey="2024-01-15" />,
    );

    await findByText('Top 10 mais vendidos');
    await findByTestId('top-product-row-mi-1');
    await findByText('Pastel de Carne');
    await findByText('42 un');
    await findByText('R$ 210,00');
    await findByText('Coxinha');
  });

  it('exibe estado vazio quando não há vendas no período', async () => {
    const fetchTopProducts = jest.fn().mockResolvedValue(createResponse({ products: [] }));

    const { findByTestId } = render(
      <TopProductsSection fetchTopProducts={fetchTopProducts} periodKey="2024-01-15" />,
    );

    await findByTestId('top-products-empty');
  });

  it('popula os chips com categorias ativas e refaz o fetch ao selecionar uma', async () => {
    const fetchTopProducts = jest.fn().mockResolvedValue(createResponse());

    const { findByTestId } = render(
      <TopProductsSection fetchTopProducts={fetchTopProducts} periodKey="2024-01-15" />,
    );

    // Primeiro fetch: sem filtro (todas as categorias).
    await waitFor(() => expect(fetchTopProducts).toHaveBeenCalledWith([]));

    // Seleciona a categoria "Salgados" (CAT_1) — o chip usa a key = id.
    const chip = await findByTestId(`top-products-category-chip-${CAT_1}`);
    fireEvent.press(chip);

    // Refetch com a categoria selecionada.
    await waitFor(() => expect(fetchTopProducts).toHaveBeenCalledWith([CAT_1]));
  });

  it('não quebra quando o fetch falha (lista vazia, tolerante a erro)', async () => {
    const fetchTopProducts = jest.fn().mockRejectedValue(new Error('falha de rede'));

    const { findByText, findByTestId } = render(
      <TopProductsSection fetchTopProducts={fetchTopProducts} periodKey="2024-01-15" />,
    );

    await findByText('Top 10 mais vendidos');
    await findByTestId('top-products-empty');
  });

  it('ignora categorias inativas nos chips', async () => {
    mockGetCategories.mockResolvedValue([
      createCategory(CAT_1, 'Salgados', 'ativo'),
      createCategory(CAT_2, 'Bebidas', 'inativo'),
    ]);
    const fetchTopProducts = jest.fn().mockResolvedValue(createResponse());

    const { findByTestId, queryByTestId } = render(
      <TopProductsSection fetchTopProducts={fetchTopProducts} periodKey="2024-01-15" />,
    );

    await findByTestId(`top-products-category-chip-${CAT_1}`);
    expect(queryByTestId(`top-products-category-chip-${CAT_2}`)).toBeNull();
  });
});
