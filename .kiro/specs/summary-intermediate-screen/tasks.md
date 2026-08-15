# Implementation Plan: Summary Intermediate Screen (Resumo Financeiro - Calendário)

## Overview

Rewrite the intermediate summary screen from a simple 3-metric view into a full financial calendar screen. This involves adding shared types, a new backend endpoint (`GET /api/summary/monthly`), new utility functions, five new UI components, a complete rewrite of `IntermediateSummaryScreen`, and an API client extension. The existing navigation structure and extracted utilities (`formatPrice`, `computeTotalRevenue`) remain in place.

## Tasks

- [x] 1. Add shared types and backend endpoint
  - [x] 1.1 Add `MonthlySummaryResponse` and `DayBreakdown` types to packages/shared
    - Create `packages/shared/src/types/summary.ts` with `MonthlySummaryResponse` and `DayBreakdown` interfaces
    - Export from packages/shared barrel file
    - Types define: year, month, totals (totalOrders, totalRevenue, totalReceived, totalPending), and days[] array with day, orderCount, revenue, paidOrders
    - _Requirements: 7.2, 7.3_

  - [x] 1.2 Implement `GET /api/summary/monthly` backend endpoint
    - Add `getMonthlySummary` handler in `apps/backend/src/controllers/summary.controller.ts`
    - Accept query params `year` (integer) and `month` (integer 1-12), validate with 400 error for invalid/missing params
    - Run two SQL queries: monthly totals aggregation and per-day breakdown grouped by `EXTRACT(DAY FROM order_date)`
    - Use `America/Sao_Paulo` timezone for date calculations
    - Return `MonthlySummaryResponse` JSON
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 1.3 Register the monthly summary route
    - Add `GET /monthly` route in `apps/backend/src/routes/summary.routes.ts` with `authMiddleware` and `syncUserMiddleware`
    - _Requirements: 7.1, 7.6_

- [x] 2. Add new utility functions
  - [x] 2.1 Add `getPortugueseMonthName` and `formatSelectedDate` to `apps/mobile/src/utils/format.ts`
    - `getPortugueseMonthName(month: number): string` — returns Portuguese month name for 1-based month
    - `formatSelectedDate(day: number, month: number, year: number): string` — returns "[dia] de [Mês], [Ano]"
    - _Requirements: 2.1, 3.1, 5.1_

  - [x] 2.2 Create `apps/mobile/src/utils/calendar.ts` with calendar utility functions
    - `getDaysInMonth(year, month): number`
    - `getFirstDayOfMonth(year, month): number` — weekday index (0=Sunday)
    - `getDefaultSelectedDay(days: DayBreakdown[]): number` — smallest day with orders, or 1 if empty
    - `generateCalendarGrid(year, month): (number | null)[][]` — 4-6 rows of 7 cells
    - _Requirements: 5.4, 6.1, 6.6_

- [x] 3. Checkpoint - Ensure backend and utilities compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement new UI components
  - [x] 4.1 Create `MonthlySummaryCard` component
    - Location: `apps/mobile/src/components/MonthlySummaryCard.tsx`
    - Props: monthName, totalOrders, totalRevenue, totalReceived, totalPending
    - Displays "Acumulado em [Mês]" title with calendar_month icon, four sub-cards in 2×2 grid
    - Sub-cards: Pedidos (receipt_long, #7B2D2D), Faturamento (payments, #D4812B), Recebido (check_circle, #2E7D32), Pendente (schedule, #C62828)
    - Use `formatPrice` for currency values
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 4.2 Create `SelectedDayCard` component
    - Location: `apps/mobile/src/components/SelectedDayCard.tsx`
    - Props: date, orderCount, revenue, paidOrders, totalOrders, onViewFullSummary
    - Displays formatted date, stats row (Pedidos, Faturamento, Pagos as paid/total), "Ver Resumo Completo" button
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 4.3 Create `CalendarCard` component
    - Location: `apps/mobile/src/components/CalendarCard.tsx`
    - Props: year, month, selectedDay, daysWithOrders, onDayPress
    - Renders weekday headers "Dom Seg Ter Qua Qui Sex Sáb", day grid using `generateCalendarGrid`
    - Shows amber dot for days with orders, dark red dot for selected day
    - Empty cells for adjacent months
    - _Requirements: 4.6, 4.7, 4.8, 4.9, 4.11_

  - [x] 4.4 Create `DateSelector` component
    - Location: `apps/mobile/src/components/DateSelector.tsx`
    - Props: year, month, onPrevious, onNext
    - Displays chevron arrows around Portuguese month/year label
    - _Requirements: 4.2, 5.1_

  - [x] 4.5 Create `CalendarLegend` component
    - Location: `apps/mobile/src/components/CalendarLegend.tsx`
    - Static component: amber dot "Dia com pedidos", dark red dot "Dia selecionado"
    - _Requirements: 4.5_

  - [x] 4.6 Create `DateChip` component
    - Location: `apps/mobile/src/components/DateChip.tsx`
    - Props: day, month, year, onPress
    - Touchable element displaying formatted date "[dia] de [Mês], [Ano]" with calendar icon
    - Positioned below AppBar on main screen
    - _Requirements: 1.3, 1.4_

  - [x] 4.7 Create `CalendarModal` component
    - Location: `apps/mobile/src/components/CalendarModal.tsx`
    - Props: visible, year, month, selectedDay, daysWithOrders, onDaySelect, onClose
    - React Native Modal with semi-transparent backdrop
    - Contains: DateSelector (for month navigation within modal), CalendarLegend, CalendarCard
    - Month navigation is local to the modal (allows browsing without affecting main screen until day is selected)
    - On day tap: calls onDaySelect(day, month, year) and closes
    - On close without selection: calls onClose(), retains previous selection
    - _Requirements: 4.1, 4.10, 4.12_

- [x] 5. Add API client method and rewrite IntermediateSummaryScreen
  - [x] 5.1 Add `getMonthlySummary` to the API client
    - Add method signature to `apps/mobile/src/services/types.ts` ApiClient interface
    - Implement in `apps/mobile/src/services/real-client.ts` calling `GET /api/summary/monthly?year=X&month=Y`
    - _Requirements: 6.1_

  - [x] 5.2 Rewrite `IntermediateSummaryScreen` composing all new components
    - Complete rewrite of `apps/mobile/src/screens/IntermediateSummaryScreen.tsx`
    - Manage state: year, month, selectedDay, monthlySummary, loading, refreshing, error, calendarModalVisible
    - On mount: fetch current month, default selectedDay via `getDefaultSelectedDay`
    - Compose: AppBar, DateChip (opens CalendarModal), ScrollView with MonthlySummaryCard and SelectedDayCard
    - CalendarModal opens on DateChip tap, closes on day select or dismiss
    - When day selected from different month: fetch new month data then update
    - "Ver Resumo Completo" navigates to full-summary with selected date
    - Realtime: listen on `orders:queue` and `orders:payment` to trigger refetch
    - Pull-to-refresh support via RefreshControl
    - Loading state: ActivityIndicator with "Carregando..."
    - Error state: error message + "Tentar novamente" button
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.4, 3.6, 5.2, 5.3, 5.4, 6.5, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3, 10.1, 10.2, 10.3, 10.4_

- [x] 6. Checkpoint - Verify full screen renders and navigates
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Write property-based tests
  - [x] 7.1 Write property test for MonthlySummaryCard display correctness
    - **Property 1: Monthly Summary Card displays correct computed values**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
    - Create `apps/mobile/src/__tests__/properties/monthly-summary-card.property.test.ts`
    - Generate random MonthlySummaryResponse objects, verify card renders correct formatted values and month name

  - [x] 7.2 Write property test for SelectedDayCard display correctness
    - **Property 2: Selected Day Card displays correct derived values**
    - **Validates: Requirements 3.1, 3.2**
    - Create `apps/mobile/src/__tests__/properties/selected-day-card.property.test.ts`
    - Generate random (day, month, year, dayData) tuples, verify correct date format and stat values

  - [x] 7.3 Write property test for calendar grid generation
    - **Property 3: Calendar grid generation correctness**
    - **Validates: Requirements 6.1, 6.6**
    - Create `apps/mobile/src/__tests__/properties/calendar-grid.property.test.ts`
    - Generate random (year, month), verify: only valid day numbers or null, day 1 at correct weekday, 4-6 rows

  - [x] 7.4 Write property test for order indicator dots
    - **Property 4: Order indicator dots match per-day breakdown**
    - **Validates: Requirements 6.3**
    - Create `apps/mobile/src/__tests__/properties/calendar-dots.property.test.ts` (or extend calendar-grid test)
    - Generate random daysWithOrders arrays, verify rendered dots match exactly

  - [x] 7.5 Write property test for default day selection
    - **Property 5: Default day selection algorithm**
    - **Validates: Requirements 5.4, 3.6**
    - Create `apps/mobile/src/__tests__/properties/default-day-selection.property.test.ts`
    - Generate random DayBreakdown arrays (including empty), verify smallest day or 1

  - [x] 7.6 Write property test for monthly API aggregation
    - **Property 6: Monthly API aggregation correctness**
    - **Validates: Requirements 7.2, 7.3**
    - Create `apps/backend/src/__tests__/properties/summary-monthly-aggregation.property.test.ts`
    - Generate random order sets, verify totals and per-day sums match

  - [x] 7.7 Write property test for timezone date attribution
    - **Property 7: Timezone date attribution**
    - **Validates: Requirements 7.5**
    - Create `apps/backend/src/__tests__/properties/summary-timezone.property.test.ts`
    - Generate orders near midnight boundaries, verify correct day attribution in America/Sao_Paulo

- [x] 8. Write unit tests
  - [x] 8.1 Write unit tests for IntermediateSummaryScreen
    - Create `apps/mobile/src/__tests__/unit/intermediate-summary-screen.test.tsx`
    - Test: AppBar renders "Resumo Financeiro" title
    - Test: Monthly Summary Card renders with correct month data
    - Test: Selected Day Card updates on day tap
    - Test: "Ver Resumo Completo" navigates to full-summary with date
    - Test: Month navigation (chevrons) fetches new month data
    - Test: Default day selection on mount and month change
    - Test: Loading state shows ActivityIndicator
    - Test: Error state shows message and retry button
    - Test: Retry re-fetches data
    - Test: Pull-to-refresh triggers refetch
    - Test: Realtime events on orders:queue and orders:payment trigger refetch
    - Test: Empty month shows zeros gracefully
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 3.4, 5.2, 5.3, 5.4, 6.5, 8.1, 8.2, 8.3, 9.1, 9.2, 9.3_

  - [x] 8.2 Write unit tests for monthly summary backend endpoint
    - Create `apps/backend/src/__tests__/unit/summary-monthly-controller.test.ts`
    - Test: Returns 400 for missing year/month params
    - Test: Returns 400 for invalid month (0, 13, non-integer)
    - Test: Returns 401 without auth token
    - Test: Returns correct aggregation for known order set
    - Test: Returns empty days array for month with no orders
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript with React Native (Expo Router) for mobile and Node.js/Express for backend
- Existing navigation structure (`app/(tabs)/summary/`) and utilities (`formatPrice`, `computeTotalRevenue`) are preserved from prior implementation
- The `DailySummaryScreen` (full summary) remains unchanged and accessible via stack navigation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2"] },
    { "id": 2, "tasks": ["4.1", "4.4", "4.5", "4.6"] },
    { "id": 3, "tasks": ["4.2", "4.3", "5.1"] },
    { "id": 4, "tasks": ["4.7"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7"] },
    { "id": 7, "tasks": ["8.1", "8.2"] }
  ]
}
```
