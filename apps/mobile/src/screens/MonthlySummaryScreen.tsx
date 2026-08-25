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
import { ErrorState } from '../components/ErrorState';
import { CalendarModal } from '../components/CalendarModal';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';
import { useAuth } from '../hooks/useAuth';
import { formatPrice, getPortugueseMonthName } from '../utils/format';
import { SubCard } from '../components/SubCard';
import { PaymentRow } from '../components/PaymentRow';

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
  const { tenantId } = useAuth();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [daysWithOrders, setDaysWithOrders] = useState<number[]>([]);

  const monthName = useMemo(() => getPortugueseMonthName(month), [month]);

  // Header title with month name: "Resumo - Agosto/2026"
  const headerTitle = useMemo(() => `Resumo - ${monthName} ${year}`, [monthName, year]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchMonthlySummary = useCallback(async (fetchYear: number, fetchMonth: number) => {
    try {
      setError(null);
      const data = await apiClient.getMonthlySummary(fetchYear, fetchMonth);
      setMonthlySummary(data);
      setDaysWithOrders(data.days.map((d: { day: number }) => d.day));
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

  // Realtime updates — subscribe only to THIS tenant's namespaced channels (R12.7, R12.9).
  const realtimeChannels = useMemo(
    () => (tenantId ? [`orders:queue:${tenantId}`, `orders:payment:${tenantId}`] : []),
    [tenantId],
  );
  useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback(() => { fetchMonthlySummary(year, month); }, [fetchMonthlySummary, year, month]),
    onReconnect: useCallback(() => { fetchMonthlySummary(year, month); }, [fetchMonthlySummary, year, month]),
    enabled: tenantId !== null,
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleDaySelect = useCallback(async (_selectedDay: number, selectedMonth: number, selectedYear: number) => {
    setCalendarModalVisible(false);
    setMonth(selectedMonth);
    setYear(selectedYear);
    setLoading(true);
    await fetchMonthlySummary(selectedYear, selectedMonth);
    setLoading(false);
  }, [fetchMonthlySummary]);

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

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  };

  const gridContainerStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    gap: 10,
  };

  const rowStyle: ViewStyle = { flexDirection: 'row', gap: 10 };

  const paymentCardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 4,
  };

  const calendarRightElement = (
    <Pressable onPress={() => setCalendarModalVisible(true)} accessibilityRole="button" accessibilityLabel="Selecionar mês">
      <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 24, color: theme.colors.textSecondary }}>calendar_today</RNText>
    </Pressable>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !monthlySummary) {
    return (
      <Screen padding={false}>
        <Header title={headerTitle} onBack={() => router.back()} rightElement={calendarRightElement} />
        <View style={loadingContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} testID="loading-indicator" />
          <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 }}>
            Carregando...
          </RNText>
        </View>
      </Screen>
    );
  }

  if (error && !monthlySummary) {
    return (
      <Screen padding={false}>
        <Header title={headerTitle} onBack={() => router.back()} rightElement={calendarRightElement} />
        <ErrorState message={error} onRetry={handleRetry} />
      </Screen>
    );
  }

  const totals = monthlySummary?.totals;

  return (
    <Screen padding={false}>
      <Header title={headerTitle} onBack={() => router.back()} rightElement={calendarRightElement} />

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
        {/* Sub-cards grid 2×2 */}
        <View style={gridContainerStyle}>
          <View style={rowStyle}>
            <SubCard
              icon="receipt_long"
              color={theme.colors.primary}
              backgroundColor={theme.colors.surfacePrimary}
              value={String(totals?.totalOrders ?? 0)}
              label="Pedidos"
              labelColor={theme.colors.textSecondary}
            />
            <SubCard
              icon="payments"
              color={theme.colors.revenue}
              backgroundColor={theme.colors.surfaceRevenue}
              value={formatPrice(totals?.totalRevenue ?? 0)}
              label="Faturamento"
              labelColor={theme.colors.textSecondary}
            />
          </View>
          <View style={rowStyle}>
            <SubCard
              icon="check_circle"
              color={theme.colors.received}
              backgroundColor={theme.colors.surfaceReceived}
              value={formatPrice(totals?.totalReceived ?? 0)}
              label="Recebido"
              labelColor={theme.colors.textSecondary}
            />
            <SubCard
              icon="schedule"
              color={theme.colors.pending}
              backgroundColor={theme.colors.surfacePending}
              value={formatPrice(totals?.totalPending ?? 0)}
              label="Pendente"
              labelColor={theme.colors.textSecondary}
            />
          </View>
        </View>

        {/* Section: Formas de Pagamento */}
        <RNText style={sectionTitleStyle}>Formas de Pagamento</RNText>

        <View style={paymentCardStyle}>
          <PaymentRow icon="qr_code" iconColor={theme.colors.success} label="PIX" value={formatPrice(monthlySummary?.byPaymentMethod?.pix ?? 0)} textColor={theme.colors.primary} />
          <PaymentRow icon="credit_card" iconColor={theme.colors.preparando} label="Cartão Débito" value={formatPrice(monthlySummary?.byPaymentMethod?.['cartão débito'] ?? 0)} textColor={theme.colors.primary} />
          <PaymentRow icon="credit_card" iconColor={theme.colors.preparando} label="Cartão Crédito" value={formatPrice(monthlySummary?.byPaymentMethod?.['cartão crédito'] ?? 0)} textColor={theme.colors.primary} />
          <PaymentRow icon="payments" iconColor={theme.colors.primary} label="Dinheiro" value={formatPrice(monthlySummary?.byPaymentMethod?.dinheiro ?? 0)} textColor={theme.colors.primary} />
        </View>
      </ScrollView>

      {/* Calendar Modal — user picks any day, we use its month/year */}
      <CalendarModal
        visible={calendarModalVisible}
        year={year}
        month={month}
        selectedDay={-1}
        daysWithOrders={daysWithOrders}
        onDaySelect={handleDaySelect}
        onMonthChange={async (newYear, newMonth) => {
          try {
            const data = await apiClient.getMonthlySummary(newYear, newMonth);
            return data.days.map((d: { day: number }) => d.day);
          } catch {
            return [];
          }
        }}
        onClose={() => setCalendarModalVisible(false)}
      />
    </Screen>
  );
}
