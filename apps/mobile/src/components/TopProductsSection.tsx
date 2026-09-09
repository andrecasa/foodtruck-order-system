import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import type { Category, TopProduct, TopProductsResponse } from '@order-system/shared';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { FilterChips, type FilterChipOption } from './FilterChips';
import { formatPrice } from '../utils/format';

/**
 * TopProductsSection — seção "Top 10 mais vendidos" das telas de resumo
 * (diário e mensal).
 *
 * Exibe um ranking ÚNICO AGREGADO dos até 10 produtos mais vendidos no período,
 * ordenados por quantidade (com o faturamento ao lado). Permite filtrar por uma
 * ou mais categorias (multi-seleção); nenhuma categoria selecionada = todas as
 * categorias.
 *
 * O componente gerencia o próprio estado (categorias, filtro, produtos, loading)
 * e é DESACOPLADO do período: a tela hospedeira fornece `fetchTopProducts`, que
 * recebe as categorias selecionadas e resolve o período (dia ou mês). É
 * tolerante a falha: um erro apenas esvazia a lista, sem derrubar o resumo.
 */
export interface TopProductsSectionProps {
  /**
   * Busca o Top produtos para o período da tela, aplicando o filtro de
   * categorias informado (`[]` = todas). Fornecido pela tela hospedeira.
   */
  fetchTopProducts: (categoryIds: string[]) => Promise<TopProductsResponse>;
  /**
   * Chave que muda quando o período da tela muda (ex.: `dateStr` na diária,
   * `year-month` na mensal). Dispara um refetch mantendo o filtro atual.
   */
  periodKey: string;
}

export function TopProductsSection({ fetchTopProducts, periodKey }: TopProductsSectionProps) {
  const theme = useTheme();

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Carrega as categorias ativas uma vez (para popular os chips do filtro).
  // Tolerante a falha: sem categorias, a seção ainda mostra o ranking de todas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cats = await apiClient.getCategories();
        if (!cancelled) setCategories(cats.filter((c) => c.status === 'ativo'));
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebusca o ranking sempre que o período ou o filtro de categorias mudar.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await fetchTopProducts(selectedCategoryIds);
        if (!cancelled) setProducts(data.products);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchTopProducts, periodKey, selectedCategoryIds]);

  const handleSelectionChange = useCallback((selected: string[]) => {
    setSelectedCategoryIds(selected);
  }, []);

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 4,
  };

  const emptyStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 24,
  };

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    gap: 12,
  };

  const rankBadgeStyle: ViewStyle = {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surfacePrimary ?? theme.colors.primary + '1F',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const rankTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
  };

  const nameStyle: TextStyle = {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.primary,
  };

  const metricsStyle: ViewStyle = { alignItems: 'flex-end' };

  const quantityStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  };

  const revenueStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    color: theme.colors.primary,
  };

  // ─── Filter options (chips) ──────────────────────────────────────────────────

  const chipOptions: FilterChipOption[] = categories.map((c) => ({
    key: c.id,
    label: c.name,
    color: theme.colors.primary,
  }));

  // ─── Render ─────────────────────────────────────────────────────────────────

  const renderContent = () => {
    if (loading) {
      return (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={theme.colors.primary} testID="top-products-loading" />
        </View>
      );
    }

    if (products.length === 0) {
      return (
        <RNText style={emptyStyle} testID="top-products-empty">
          Nenhuma venda no período
        </RNText>
      );
    }

    return (
      <View style={cardStyle} testID="top-products-list">
        {products.map((product, index) => (
          <View
            key={product.menuItemId}
            style={rowStyle}
            testID={`top-product-row-${product.menuItemId}`}
            accessibilityLabel={`${index + 1}º ${product.name}, ${product.quantitySold} vendidos, ${formatPrice(product.revenueCents)}`}
          >
            <View style={rankBadgeStyle}>
              <RNText style={rankTextStyle}>{index + 1}</RNText>
            </View>
            <RNText style={nameStyle} numberOfLines={1}>
              {product.name}
            </RNText>
            <View style={metricsStyle}>
              <RNText style={quantityStyle}>{`${product.quantitySold} un`}</RNText>
              <RNText style={revenueStyle}>{formatPrice(product.revenueCents)}</RNText>
            </View>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={{ gap: 10 }} testID="top-products-section">
      <RNText style={sectionTitleStyle}>Top 10 mais vendidos</RNText>

      {chipOptions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          <FilterChips
            options={chipOptions}
            selected={selectedCategoryIds}
            onSelectionChange={handleSelectionChange}
            testID="top-products-category-chip"
          />
        </ScrollView>
      )}

      {renderContent()}
    </View>
  );
}
