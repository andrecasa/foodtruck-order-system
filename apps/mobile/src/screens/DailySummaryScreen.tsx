import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
  Text as RNText,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import type { DailySummary } from '@order-system/shared';
import { useRouter, useFocusEffect } from 'expo-router';
import { Screen, Header } from '../components';
import { DateChip } from '../components/DateChip';
import { CalendarModal } from '../components/CalendarModal';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';
import { formatPrice } from '../utils/format';

/**
 * Resumo do Dia — Daily financial summary screen.
 *
 * Penpot design: "Resumo Financeiro" (with AppBar title "Resumo do Dia")
 * - DateChip for day selection (opens CalendarModal)
 * - "Resumo do Dia" section with 4 sub-cards (Pedidos, Faturamento, Recebido, Pendente)
 * - "Formas de Pagamento" section with icon rows
 * - "Acumulado do Mês" button -> navigates to MonthlySummaryScreen
 */
export function DailySummaryScreen() {
  const theme = useTheme();
  const router = useRouter();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);
  const [daysWithOrders, setDaysWithOrders] = useState<number[]>([]);

  const dateStr = useMemo(
    () => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    [year, month, day]
  );

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchSummary = useCallback(async (targetDate: string) => {
    try {
      setError(null);
      const data = await apiClient.getDailySummary(targetDate);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
    }
  }, []);

  const fetchDaysWithOrders = useCallback(async (fetchYear: number, fetchMonth: number) => {
    try {
      const data = await apiClient.getMonthlySummary(fetchYear, fetchMonth);
      setDaysWithOrders(data.days.map(d => d.day));
    } catch {
      setDaysWithOrders([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [summaryData] = await Promise.all([
          apiClient.getDailySummary(dateStr),
          fetchDaysWithOrders(year, month),
        ]);
        if (!cancelled) setSummary(summaryData);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const realtimeChannels = useMemo(() => ['orders:queue', 'orders:payment'], []);
  useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback(() => { fetchSummary(dateStr); }, [fetchSummary, dateStr]),
    onReconnect: useCallback(() => { fetchSummary(dateStr); }, [fetchSummary, dateStr]),
  });

  // Refetch when screen regains focus (e.g., returning from payment)
  useFocusEffect(
    useCallback(() => {
      fetchSummary(dateStr);
    }, [fetchSummary, dateStr])
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchSummary(dateStr);
    setRefreshing(false);
  }, [fetchSummary, dateStr]);

  const handleDaySelect = useCallback(async (selectedDay: number, selectedMonth: number, selectedYear: number) => {
    setCalendarModalVisible(false);
    setDay(selectedDay);
    if (selectedYear !== year || selectedMonth !== month) {
      setYear(selectedYear);
      setMonth(selectedMonth);
      await fetchDaysWithOrders(selectedYear, selectedMonth);
    }
    const newDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    fetchSummary(newDateStr);
  }, [year, month, fetchDaysWithOrders, fetchSummary]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    await fetchSummary(dateStr);
    setLoading(false);
  }, [fetchSummary, dateStr]);

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = { flexGrow: 1, padding: 16, gap: 16 };
  const loadingContainerStyle: ViewStyle = { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 };
  const errorContainerStyle: ViewStyle = { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 };

  const sectionTitleStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
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

  const ctaButtonStyle: ViewStyle = {
    backgroundColor: theme.colors.primary,
    borderRadius: 22,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  };

  const ctaTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: 14,
    fontWeight: '400',
    color: theme.colors.surface,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading && !summary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo do Dia" onBack={() => router.back()} />
        <View style={loadingContainerStyle}>
          <ActivityIndicator size="large" color={theme.colors.primary} testID="loading-indicator" />
          <RNText style={{ fontFamily: theme.typography.fontFamily, fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 }}>
            Carregando...
          </RNText>
        </View>
      </Screen>
    );
  }

  if (error && !summary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo do Dia" onBack={() => router.back()} />
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

  const totalRevenue = (summary?.paidTotal ?? 0) + (summary?.pendingTotal ?? 0);

  return (
    <Screen padding={false}>
      <Header title="Resumo do Dia" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={contentStyle}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
        }
        showsVerticalScrollIndicator
      >
        {/* Date Chip */}
        <DateChip day={day} month={month} year={year} onPress={() => setCalendarModalVisible(true)} />

        {/* Section: Resumo do Dia */}
        <RNText style={sectionTitleStyle}>Resumo do Dia</RNText>

        {/* Sub-cards grid 2x2 */}
        <View style={gridContainerStyle}>
          <View style={rowStyle}>
            <SubCard icon="receipt_long" color={theme.colors.primary} backgroundColor={theme.colors.surfacePrimary} value={String(summary?.totalOrders ?? 0)} label="Pedidos" labelColor={theme.colors.textSecondary} />
            <SubCard icon="payments" color={theme.colors.revenue} backgroundColor={theme.colors.surfaceRevenue} value={formatPrice(totalRevenue)} label="Faturamento" labelColor={theme.colors.textSecondary} />
          </View>
          <View style={rowStyle}>
            <SubCard icon="check_circle" color={theme.colors.received} backgroundColor={theme.colors.surfaceReceived} value={formatPrice(summary?.paidTotal ?? 0)} label="Recebido" labelColor={theme.colors.textSecondary} />
            <SubCard icon="schedule" color={theme.colors.pending} backgroundColor={theme.colors.surfacePending} value={formatPrice(summary?.pendingTotal ?? 0)} label="Pendente" labelColor={theme.colors.textSecondary} />
          </View>
        </View>

        {/* Section: Formas de Pagamento */}
        <RNText style={sectionTitleStyle}>Formas de Pagamento</RNText>

        <View style={paymentCardStyle}>
          <PaymentRow icon="qr_code" iconColor={theme.colors.success} label="PIX" value={formatPrice(summary?.byPaymentMethod.pix ?? 0)} textColor={theme.colors.primary} />
          <PaymentRow icon="credit_card" iconColor={theme.colors.preparando} label="Cartão" value={formatPrice(summary?.byPaymentMethod['cartão'] ?? 0)} textColor={theme.colors.primary} />
          <PaymentRow icon="payments" iconColor={theme.colors.primary} label="Dinheiro" value={formatPrice(summary?.byPaymentMethod.dinheiro ?? 0)} textColor={theme.colors.primary} />
        </View>

        {/* CTA: Acumulado do Mês */}
        <TouchableOpacity
          style={ctaButtonStyle}
          onPress={() => router.push('/summary/monthly')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Acumulado do Mês"
        >
          <RNText style={ctaTextStyle}>Acumulado do Mês</RNText>
        </TouchableOpacity>
      </ScrollView>

      {/* Calendar Modal */}
      <CalendarModal
        visible={calendarModalVisible}
        year={year}
        month={month}
        selectedDay={day}
        daysWithOrders={daysWithOrders}
        onDaySelect={handleDaySelect}
        onMonthChange={async (newYear, newMonth) => {
          try {
            const data = await apiClient.getMonthlySummary(newYear, newMonth);
            return data.days.map(d => d.day);
          } catch {
            return [];
          }
        }}
        onClose={() => setCalendarModalVisible(false)}
      />
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
  labelColor: string;
}

function SubCard({ icon, color, backgroundColor, value, label, labelColor }: SubCardProps) {
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
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 18, color }}>{icon}</RNText>
      </View>
      <View style={{ flex: 1 }}>
        <RNText style={{ fontSize: 15, fontWeight: '600', color }} numberOfLines={1}>{value}</RNText>
        <RNText style={{ fontSize: 10, fontWeight: '400', color: labelColor }}>{label}</RNText>
      </View>
    </View>
  );
}

interface PaymentRowProps {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  textColor: string;
}

function PaymentRow({ icon, iconColor, label, value, textColor }: PaymentRowProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: 44, gap: 12 }}>
      <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: iconColor + '1F', alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontFamily: 'Material Symbols Outlined', fontSize: 16, color: iconColor }}>{icon}</RNText>
      </View>
      <RNText style={{ flex: 1, fontSize: 14, fontWeight: '400', color: textColor }}>{label}</RNText>
      <RNText style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{value}</RNText>
    </View>
  );
}
