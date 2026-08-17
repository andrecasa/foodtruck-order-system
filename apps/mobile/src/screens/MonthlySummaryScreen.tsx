import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import type { MonthlySummaryResponse } from '@order-system/shared';
import { useRouter } from 'expo-router';
import { Screen, Header } from '../components';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';
import { formatPrice, getPortugueseMonthName } from '../utils/format';

/**
 * Resumo do Mês — Monthly accumulated summary screen.
 *
 * Penpot design: "Resumo Financeiro Acumulado"
 * - AppBar: "Resumo do Mês" centered
 * - Month selector pill with arrows (chevron_left / chevron_right) + calendar icon
 * - "Resumo do Mês" section title
 * - 4 sub-cards in 2×2 grid (Pedidos, Faturamento, Recebido, Pendente)
 * - "Formas de Pagamento" section title
 * - Payment methods card with icon rows (PIX, Cartão, Dinheiro)
 */
export function MonthlySummaryScreen() {
  const theme = useTheme();
  const router = useRouter();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthName = useMemo(() => getPortugueseMonthName(month), [month]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchMonthlySummary = useCallback(async (fetchYear: number, fetchMonth: number) => {
    try {
      setError(null);
      const data = await apiClient.getMonthlySummary(fetchYear, fetchMonth);
      setMonthlySummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await apiClient.getMonthlySummary(year, month);
        if (!cancelled) setMonthlySummary(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime updates
  const realtimeChannels = useMemo(() => ['orders:queue', 'orders:payment'], []);
  useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback(() => { fetchMonthlySummary(year, month); }, [fetchMonthlySummary, year, month]),
    onReconnect: useCallback(() => { fetchMonthlySummary(year, month); }, [fetchMonthlySummary, year, month]),
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handlePreviousMonth = useCallback(async () => {
    const newMonth = month === 1 ? 12 : month - 1;
    const newYear = month === 1 ? year - 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    setLoading(true);
    await fetchMonthlySummary(newYear, newMonth);
    setLoading(false);
  }, [year, month, fetchMonthlySummary]);

  const handleNextMonth = useCallback(async () => {
    const newMonth = month === 12 ? 1 : month + 1;
    const newYear = month === 12 ? year + 1 : year;
    setMonth(newMonth);
    setYear(newYear);
    setLoading(true);
    await fetchMonthlySummary(newYear, newMonth);
    setLoading(false);
  }, [year, month, fetchMonthlySummary]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMonthlySummary(year, month);
    setRefreshing(false);
  }, [fetchMonthlySummary, year, month]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchMonthlySummary(year, month);
    setLoading(false);
  }, [year, month, fetchMonthlySummary]);

  // ─── Payment method breakdown from daily data ───────────────────────────────
  // The monthly API doesn't include payment method breakdown,
  // so we compute it from daily summaries or show from totals.
  // For now, we'll show the monthly totals only.
  // Payment breakdown would require a new API endpoint.

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = { flexGrow: 1, padding: 16, gap: 16 };
  const loadingContainerStyle: ViewStyle = { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 };
  const errorContainerStyle: ViewStyle = { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 };

  const monthSelectorStyle: ViewStyle = {
    backgroundColor: '#7B2D2D',
    borderRadius: 17,
    height: 34,
    width: 175,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    gap: 4,
  };

  const arrowStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 22,
    color: 'rgba(255,255,255,0.8)',
  };

  const monthLabelStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    fontWeight: '400',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  };

  const calendarIconStyle: TextStyle = {
    fontFamily: 'Material Symbols Outlined',
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    marginLeft: 4,
  };

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    color: '#3D2020',
  };

  const gridContainerStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  };

  const rowStyle: ViewStyle = { flexDirection: 'row', gap: 10 };

  const paymentCardStyle: ViewStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
  };

  const paymentRowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    gap: 12,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !monthlySummary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo do Mês" onBack={() => router.back()} />
        <View style={loadingContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} testID="loading-indicator" />
          <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 14, color: '#8B6B5A', marginTop: 8 }}>
            Carregando...
          </RNText>
        </View>
      </Screen>
    );
  }

  if (error && !monthlySummary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo do Mês" onBack={() => router.back()} />
        <View style={errorContainerStyle}>
          <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 14, color: theme.colors.error, textAlign: 'center' }}>
            {error}
          </RNText>
          <View style={{ marginTop: 16 }}>
            <Button title="Tentar novamente" onPress={handleRetry} variant="primary" />
          </View>
        </View>
      </Screen>
    );
  }

  const totals = monthlySummary?.totals;

  return (
    <Screen padding={false}>
      <Header title="Resumo do Mês" onBack={() => router.back()} />

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
        {/* Month Selector */}
        <View style={monthSelectorStyle}>
          <Pressable onPress={handlePreviousMonth} accessibilityLabel="Mês anterior" hitSlop={12}>
            <RNText style={arrowStyle}>chevron_left</RNText>
          </Pressable>
          <RNText style={monthLabelStyle}>
            {monthName} {year}
          </RNText>
          <Pressable onPress={handleNextMonth} accessibilityLabel="Próximo mês" hitSlop={12}>
            <RNText style={arrowStyle}>chevron_right</RNText>
          </Pressable>
        </View>

        {/* Section: Resumo do Mês */}
        <RNText style={sectionTitleStyle}>Resumo do Mês</RNText>

        {/* Sub-cards grid 2×2 */}
        <View style={gridContainerStyle}>
          <View style={rowStyle}>
            <SubCard
              icon="receipt_long"
              color="#7B2D2D"
              backgroundColor="#FDF8F4"
              value={String(totals?.totalOrders ?? 0)}
              label="Pedidos"
            />
            <SubCard
              icon="payments"
              color="#D4812B"
              backgroundColor="#FFF8F0"
              value={formatPrice(totals?.totalRevenue ?? 0)}
              label="Faturamento"
            />
          </View>
          <View style={rowStyle}>
            <SubCard
              icon="check_circle"
              color="#2E7D32"
              backgroundColor="#F0F8F0"
              value={formatPrice(totals?.totalReceived ?? 0)}
              label="Recebido"
            />
            <SubCard
              icon="schedule"
              color="#C62828"
              backgroundColor="#FEF2F2"
              value={formatPrice(totals?.totalPending ?? 0)}
              label="Pendente"
            />
          </View>
        </View>

        {/* Section: Formas de Pagamento */}
        <RNText style={sectionTitleStyle}>Formas de Pagamento</RNText>

        <View style={paymentCardStyle}>
          <PaymentRow icon="qr_code" iconColor="#5A8C5A" label="PIX" value={formatPrice(monthlySummary?.byPaymentMethod?.pix ?? 0)} />
          <PaymentRow icon="credit_card" iconColor="#5B8BA8" label="Cartão" value={formatPrice(monthlySummary?.byPaymentMethod?.['cartão'] ?? 0)} />
          <PaymentRow icon="payments" iconColor="#7B2D2D" label="Dinheiro" value={formatPrice(monthlySummary?.byPaymentMethod?.dinheiro ?? 0)} />
        </View>
      </ScrollView>
    </Screen>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface SubCardProps {
  icon: string;
  color: string;
  backgroundColor: string;
  value: string;
  label: string;
}

function SubCard({ icon, color, backgroundColor, value, label }: SubCardProps) {
  const subCardStyle: ViewStyle = {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    height: 60,
    backgroundColor,
    gap: 8,
  };

  const iconWrapStyle: ViewStyle = {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color + '1F',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <View style={subCardStyle} accessibilityLabel={`${label}: ${value}`}>
      <View style={iconWrapStyle}>
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 18, color }}>
          {icon}
        </RNText>
      </View>
      <View style={{ flex: 1 }}>
        <RNText style={{ fontSize: 15, fontWeight: '600', color }} numberOfLines={1}>{value}</RNText>
        <RNText style={{ fontSize: 10, fontWeight: '400', color: '#8B6B5A' }}>{label}</RNText>
      </View>
    </View>
  );
}

interface PaymentRowProps {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
}

function PaymentRow({ icon, iconColor, label, value }: PaymentRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, gap: 12 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: iconColor + '1F', alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 16, color: iconColor }}>{icon}</RNText>
      </View>
      <RNText style={{ flex: 1, fontSize: 14, fontWeight: '400', color: '#7B2D2D' }}>{label}</RNText>
      <RNText style={{ fontSize: 14, fontWeight: '600', color: '#7B2D2D' }}>{value}</RNText>
    </View>
  );
}
