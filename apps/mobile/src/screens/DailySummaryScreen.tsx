import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import type { DailySummary } from '@order-system/shared';
import { Screen, Header } from '../components';
import { Text } from '../components/Typography';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';

/** Formats price in centavos to R$ X,XX */
function formatPrice(priceInCentavos: number): string {
  return (priceInCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Resumo Financeiro (Daily Summary) Screen — pixel-perfect match to Penpot design.
 *
 * Penpot specs:
 * - AppBar: bg white, shadow, title "Resumo Financeiro" 18px weight 500, color theme.text
 * - Content: padding 16px, gap 16px
 * - Hero card (Revenue): bg primary (#7B2D2D) at 6% opacity, radius 12px, padding 16px, text-align center
 *   - Label "Faturamento Total": 12px weight 400, color #8B6B5A (textSecondary)
 *   - Amount: 28px weight 400, color #7B2D2D (primary)
 *   - Count "N pedidos hoje": 12px weight 400, color #8B6B5A (textSecondary)
 * - Section titles: 14px weight 400, color theme.text
 * - Data cards: bg white, radius 12px, shadow 0 1px 3px rgba(0,0,0,0.04), padding 14px
 *   - Row: flex row space-between
 *   - Label: 14px weight 400, color theme.text
 *   - Value: 14px weight 400, color theme.text (or theme.primary for "Pagos"/"Recebido", theme.error for "Pendentes"/"Pendente")
 */
export function DailySummaryScreen() {
  const theme = useTheme();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getDailySummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
    }
  }, []);

  // Realtime: refresh summary when orders change
  const realtimeChannels = useMemo(() => ['orders:queue', 'orders:payment'], []);

  useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback((_event) => {
      // Refetch summary on any order event
      fetchSummary();
    }, [fetchSummary]),
    onReconnect: useCallback(() => {
      fetchSummary();
    }, [fetchSummary]),
  });

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await apiClient.getDailySummary();
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary();
    setRefreshing(false);
  }, [fetchSummary]);

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    padding: 16,
    gap: 16,
  };

  const heroCardStyle: ViewStyle = {
    backgroundColor: 'rgba(123, 45, 45, 0.06)', // primary at 6% opacity per Penpot
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  };

  const heroLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: '#8B6B5A', // textSecondary
  };

  const heroAmountStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 28,
    fontWeight: '400',
    color: theme.colors.primary, // #7B2D2D
    marginTop: 4,
  };

  const heroCountStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: '400',
    color: '#8B6B5A', // textSecondary
    marginTop: 4,
  };

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
    marginBottom: 8,
  };

  const dataCardStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.04)',
    elevation: 1,
    gap: 8,
  };

  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const rowLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const rowValueStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.text,
  };

  const rowValuePrimaryStyle: TextStyle = {
    ...rowValueStyle,
    color: theme.colors.primary,
  };

  const rowValueWarningStyle: TextStyle = {
    ...rowValueStyle,
    color: theme.colors.error,
  };

  const loadingContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  const errorContainerStyle: ViewStyle = {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <Screen padding={false}>
        <Header title="Resumo Financeiro" icon="monitoring" />
        <View style={loadingContainerStyle} accessibilityLabel="Carregando resumo">
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text size="md" style={{ marginTop: 8 }}>
            Carregando resumo...
          </Text>
        </View>
      </Screen>
    );
  }

  // Error state
  if (error && !summary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo Financeiro" icon="monitoring" />
        <View style={errorContainerStyle}>
          <Text size="lg" color={theme.colors.error}>
            {error}
          </Text>
          <View style={{ marginTop: 16 }}>
            <Button
              title="Tentar novamente"
              onPress={async () => {
                setLoading(true);
                await fetchSummary();
                setLoading(false);
              }}
              variant="primary"
            />
          </View>
        </View>
      </Screen>
    );
  }

  if (!summary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo Financeiro" icon="monitoring" />
        <View style={errorContainerStyle}>
          <Text size="md" color="#8B6B5A">
            Nenhum dado disponível.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      {/* AppBar */}
      <Header title="Resumo Financeiro" icon="monitoring" />

      <ScrollView
        contentContainerStyle={contentStyle}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator
      >
        {/* Hero Card — Total Revenue */}
        <View style={heroCardStyle}>
          <RNText style={heroLabelStyle}>Faturamento Total</RNText>
          <RNText style={heroAmountStyle}>
            {formatPrice(summary.paidTotal + summary.pendingTotal)}
          </RNText>
          <RNText style={heroCountStyle}>
            {summary.totalOrders} pedido{summary.totalOrders !== 1 ? 's' : ''} hoje
          </RNText>
        </View>

        {/* Orders Breakdown */}
        <View>
          <RNText style={sectionTitleStyle}>Pedidos</RNText>
          <View style={dataCardStyle}>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Total de pedidos</RNText>
              <RNText style={rowValueStyle}>{summary.totalOrders}</RNText>
            </View>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Pagos</RNText>
              <RNText style={rowValuePrimaryStyle}>{summary.paidOrders}</RNText>
            </View>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Pendentes</RNText>
              <RNText style={rowValueWarningStyle}>{summary.pendingOrders}</RNText>
            </View>
          </View>
        </View>

        {/* Financial Breakdown */}
        <View>
          <RNText style={sectionTitleStyle}>Financeiro</RNText>
          <View style={dataCardStyle}>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Recebido</RNText>
              <RNText style={rowValuePrimaryStyle}>{formatPrice(summary.paidTotal)}</RNText>
            </View>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Pendente</RNText>
              <RNText style={rowValueWarningStyle}>{formatPrice(summary.pendingTotal)}</RNText>
            </View>
          </View>
        </View>

        {/* Payment Method Breakdown */}
        <View>
          <RNText style={sectionTitleStyle}>Por Forma de Pagamento</RNText>
          <View style={dataCardStyle}>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Dinheiro</RNText>
              <RNText style={rowValueStyle}>{formatPrice(summary.byPaymentMethod.dinheiro)}</RNText>
            </View>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>PIX</RNText>
              <RNText style={rowValueStyle}>{formatPrice(summary.byPaymentMethod.pix)}</RNText>
            </View>
            <View style={rowStyle}>
              <RNText style={rowLabelStyle}>Cartão</RNText>
              <RNText style={rowValueStyle}>{formatPrice(summary.byPaymentMethod['cartão'])}</RNText>
            </View>
          </View>
        </View>

        {/* Hint about pull-to-refresh */}
        <RNText style={{
          fontFamily: theme.typography.fontFamily,
          fontSize: 12,
          fontWeight: '400',
          color: '#8B6B5A',
          textAlign: 'center',
          marginTop: 8,
          marginBottom: 24,
        }}>
          Puxe para baixo para atualizar
        </RNText>
      </ScrollView>
    </Screen>
  );
}
