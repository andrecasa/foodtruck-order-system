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
import type { MonthlySummaryResponse } from '@order-system/shared';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Screen, Header } from '../components';
import { DateChip } from '../components/DateChip';
import { MonthlySummaryCard } from '../components/MonthlySummaryCard';
import { SelectedDayCard } from '../components/SelectedDayCard';
import { CalendarModal } from '../components/CalendarModal';
import { Button } from '../components/Button';
import { useTheme } from '../theme';
import { apiClient } from '../services/api-client';
import { useRealtime } from '../hooks/useRealtime';
import { getPortugueseMonthName } from '../utils/format';
import { getDefaultSelectedDay } from '../utils/calendar';

/**
 * Intermediate Summary Screen ("Resumo Financeiro")
 *
 * Displays a monthly financial overview with:
 * - AppBar with title "Resumo Financeiro"
 * - DateChip showing selected date (opens CalendarModal)
 * - MonthlySummaryCard with accumulated monthly totals
 * - SelectedDayCard with per-day stats and CTA to full summary
 * - CalendarModal for interactive day/month selection
 *
 * Supports pull-to-refresh, realtime updates, and error/loading states.
 */
export function IntermediateSummaryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();

  // Parse initial date from route params (when returning from full-summary) or use today
  const initialDate = useMemo(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      const [y, m, d] = params.date.split('-').map(Number);
      return { year: y!, month: m!, day: d! };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }, [params.date]);

  // State
  const [year, setYear] = useState(initialDate.year);
  const [month, setMonth] = useState(initialDate.month);
  const [selectedDay, setSelectedDay] = useState(initialDate.day);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarModalVisible, setCalendarModalVisible] = useState(false);

  // Update state when returning from full-summary with a date param
  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      const [y, m, d] = params.date.split('-').map(Number);
      if (y && m && d) {
        setYear(y);
        setMonth(m);
        setSelectedDay(d);
      }
    }
  }, [params.date]);

  // ─── Data Fetching ──────────────────────────────────────────────────────────

  const fetchMonthlySummary = useCallback(async (fetchYear: number, fetchMonth: number) => {
    try {
      setError(null);
      const data = await apiClient.getMonthlySummary(fetchYear, fetchMonth);
      setMonthlySummary(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
      return null;
    }
  }, []);

  // Initial load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await apiClient.getMonthlySummary(year, month);
        if (!cancelled) {
          setMonthlySummary(data);
          // Only set default day if no date was passed via params (i.e. fresh navigation)
          if (!params.date) {
            setSelectedDay(getDefaultSelectedDay(data.days, year, month));
          }
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Realtime ───────────────────────────────────────────────────────────────

  const realtimeChannels = useMemo(() => ['orders:queue', 'orders:payment'], []);

  useRealtime({
    channels: realtimeChannels,
    onEvent: useCallback((_event) => {
      fetchMonthlySummary(year, month);
    }, [fetchMonthlySummary, year, month]),
    onReconnect: useCallback(() => {
      fetchMonthlySummary(year, month);
    }, [fetchMonthlySummary, year, month]),
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMonthlySummary(year, month);
    setRefreshing(false);
  }, [fetchMonthlySummary, year, month]);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getMonthlySummary(year, month);
      setMonthlySummary(data);
      setSelectedDay(getDefaultSelectedDay(data.days, year, month));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const handleDaySelect = useCallback(async (day: number, selectedMonth: number, selectedYear: number) => {
    setCalendarModalVisible(false);

    if (selectedMonth !== month || selectedYear !== year) {
      // Different month: fetch new data then update
      setLoading(true);
      try {
        const data = await apiClient.getMonthlySummary(selectedYear, selectedMonth);
        setYear(selectedYear);
        setMonth(selectedMonth);
        setMonthlySummary(data);
        setSelectedDay(day);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar resumo');
      } finally {
        setLoading(false);
      }
    } else {
      // Same month: just update selectedDay
      setSelectedDay(day);
    }
  }, [year, month]);

  const handleViewFullSummary = useCallback(() => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`;
    router.push({ pathname: '/summary/full-summary', params: { date: dateStr } });
  }, [router, year, month, selectedDay]);

  // ─── Derived Data ───────────────────────────────────────────────────────────

  const daysWithOrders = useMemo(() => {
    if (!monthlySummary) return [];
    return monthlySummary.days.map(d => d.day);
  }, [monthlySummary]);

  const selectedDayData = useMemo(() => {
    if (!monthlySummary) return null;
    return monthlySummary.days.find(d => d.day === selectedDay) ?? null;
  }, [monthlySummary, selectedDay]);

  const selectedDate = useMemo(() => {
    return new Date(year, month - 1, selectedDay);
  }, [year, month, selectedDay]);

  const monthName = useMemo(() => getPortugueseMonthName(month), [month]);

  // ─── Styles ─────────────────────────────────────────────────────────────────

  const contentStyle: ViewStyle = {
    flexGrow: 1,
    padding: 16,
    gap: 16,
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

  const errorTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.lg,
    color: theme.colors.error,
    textAlign: 'center',
  };

  const loadingTextStyle: TextStyle = {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.sizes.md,
    color: theme.colors.text,
    marginTop: 8,
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Loading state (initial)
  if (loading && !monthlySummary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo Financeiro" />
        <View style={loadingContainerStyle} accessibilityLabel="Carregando resumo">
          <ActivityIndicator
            testID="loading-indicator"
            size="large"
            color={theme.colors.primary}
          />
          <RNText style={loadingTextStyle}>
            Carregando...
          </RNText>
        </View>
      </Screen>
    );
  }

  // Error state (no data available)
  if (error && !monthlySummary) {
    return (
      <Screen padding={false}>
        <Header title="Resumo Financeiro" />
        <View style={errorContainerStyle}>
          <RNText
            testID="error-message"
            style={errorTextStyle}
          >
            {error}
          </RNText>
          <View style={{ marginTop: 16 }}>
            <Button
              title="Tentar novamente"
              testID="retry-button"
              onPress={handleRetry}
              variant="primary"
            />
          </View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padding={false}>
      <Header title="Resumo Financeiro" />

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
        {/* Date Chip */}
        <DateChip
          day={selectedDay}
          month={month}
          year={year}
          onPress={() => setCalendarModalVisible(true)}
        />

        {/* Monthly Summary Card */}
        {monthlySummary && (
          <MonthlySummaryCard
            monthName={monthName}
            totalOrders={monthlySummary.totals.totalOrders}
            totalRevenue={monthlySummary.totals.totalRevenue}
            totalReceived={monthlySummary.totals.totalReceived}
            totalPending={monthlySummary.totals.totalPending}
          />
        )}

        {/* Selected Day Card */}
        <SelectedDayCard
          date={selectedDate}
          orderCount={selectedDayData?.orderCount ?? 0}
          revenue={selectedDayData?.revenue ?? 0}
          paidOrders={selectedDayData?.paidOrders ?? 0}
          totalOrders={selectedDayData?.orderCount ?? 0}
          onViewFullSummary={handleViewFullSummary}
        />
      </ScrollView>

      {/* Calendar Modal */}
      <CalendarModal
        visible={calendarModalVisible}
        year={year}
        month={month}
        selectedDay={selectedDay}
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
