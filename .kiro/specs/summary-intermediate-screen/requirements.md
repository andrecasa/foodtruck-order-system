# Requirements Document

## Introduction

This feature introduces the "Resumo Financeiro" intermediate screen in the mobile app. The screen provides a monthly financial overview with monthly accumulators (4 sub-cards) and a selected-day summary panel. An interactive calendar for day selection is accessible via a touchable date chip at the top of the screen, which opens a modal overlay containing the full calendar grid, month navigation, and legend. The existing full summary screen remains accessible via a "Ver Resumo Completo" button.

## Glossary

- **Intermediate_Screen**: The screen displayed when the Operator taps the "Resumo" tab, showing a touchable date chip at the top, monthly accumulated totals, and a selected-day summary panel.
- **Full_Summary_Screen**: The existing "Resumo Financeiro" detail screen that shows a complete daily breakdown including per-payment-method data.
- **Operator**: The food truck worker who uses the mobile app to manage orders, payments, and view daily reports.
- **Monthly_Summary_Card**: The card titled "Acumulado em [Mês]" displaying four sub-cards with the month's total orders, total revenue, total received, and total pending amounts.
- **Selected_Day_Card**: The card displaying the selected day's date, order count, revenue, and paid-vs-total ratio, plus a CTA button to view the full summary.
- **Calendar_Modal**: A modal overlay containing the Date Selector (month navigation), Calendar Legend, and interactive Calendar grid for selecting a specific day.
- **Date_Chip**: A touchable element at the top of the main screen displaying the currently selected date, which opens the Calendar_Modal when tapped.
- **Calendar_Card**: The monthly calendar grid (inside the modal) showing weekday headers and day cells with visual indicator dots for days that have orders.
- **Date_Selector**: The navigation row (inside the modal) with chevron arrows and month/year label allowing the Operator to browse different months.
- **Legend**: A row of colored dot indicators (inside the modal) explaining the calendar's visual markers (day with orders, selected day).
- **AppBar**: The top navigation bar with back arrow and screen title "Resumo Financeiro".
- **Navigation_System**: The Expo Router tab-based navigation that manages screen transitions in the mobile app.
- **Summary_API**: The backend API responsible for providing monthly accumulated totals and per-day summary data.
- **Order_Indicator_Dot**: An amber (#D4812B) 6px circle displayed under a calendar day number to indicate that day has at least one order.
- **Selected_Day_Dot**: A dark red (#831515) 6px circle displayed under the currently selected day number.

## Requirements

### Requirement 1: Display AppBar with Navigation and Date Chip

**User Story:** As an Operator, I want to see a clear title, back navigation, and the currently selected date at the top of the screen, so that I know where I am, can return to the previous screen, and can quickly access the calendar to change the day.

#### Acceptance Criteria

1. THE Intermediate_Screen SHALL display an AppBar with a white background, height 56px, containing a back arrow icon and the title "Resumo Financeiro" (18px, weight 400, color #3D2020).
2. WHEN the Operator taps the back arrow, THE Navigation_System SHALL navigate back to the previous screen.
3. THE Intermediate_Screen SHALL display a Date_Chip below the AppBar showing the currently selected date formatted as "[dia] de [Mês], [Ano]" in Portuguese, styled as a touchable element.
4. WHEN the Operator taps the Date_Chip, THE Intermediate_Screen SHALL open the Calendar_Modal as an overlay.

### Requirement 2: Display Monthly Summary Card

**User Story:** As an Operator, I want to see the month's accumulated totals (orders, revenue, received, pending) at a glance, so that I can understand the overall financial performance for the current month.

#### Acceptance Criteria

1. THE Monthly_Summary_Card SHALL display the title "Acumulado em [Mês]" where [Mês] is the Portuguese name of the currently displayed month, preceded by a "calendar_month" icon (20px, color #7B2D2D).
2. THE Monthly_Summary_Card SHALL display a "Pedidos" sub-card showing the total number of orders for the displayed month, with a "receipt_long" icon (18px, color #7B2D2D), background color #FDF8F4, and value formatted as an integer (15px, weight 600, color #7B2D2D).
3. THE Monthly_Summary_Card SHALL display a "Faturamento" sub-card showing the total revenue (paid + pending) for the displayed month, with a "payments" icon (18px, color #D4812B), background color #FFF8F0, and value formatted as Brazilian currency (15px, weight 600, color #D4812B).
4. THE Monthly_Summary_Card SHALL display a "Recebido" sub-card showing the total received (paid only) amount for the displayed month, with a "check_circle" icon (18px, color #2E7D32), background color #F0F8F0, and value formatted as Brazilian currency (15px, weight 600, color #2E7D32).
5. THE Monthly_Summary_Card SHALL display a "Pendente" sub-card showing the total pending amount for the displayed month, with a "schedule" icon (18px, color #C62828), background color #FEF2F2, and value formatted as Brazilian currency (15px, weight 600, color #C62828).
6. THE Monthly_Summary_Card SHALL use a white background (#FFFFFF), border radius 12px, padding 14px, column layout with gap 12px, and arrange sub-cards in two rows of two with gap 10px.

### Requirement 3: Display Selected Day Summary Card

**User Story:** As an Operator, I want to see a summary for the selected day including order count, revenue, and paid ratio, so that I can quickly assess a specific day's performance.

#### Acceptance Criteria

1. THE Selected_Day_Card SHALL display the selected date formatted as "[dia] de [Mês], [Ano]" in Portuguese (14px, weight 500, color #3D2020).
2. THE Selected_Day_Card SHALL display three stats in an evenly distributed row: "Pedidos" (total order count, value 20px weight 500 color #7B2D2D), "Faturamento" (total revenue formatted as Brazilian currency, value 20px weight 500 color #7B2D2D), and "Pagos" (paid/total ratio formatted as "[paid]/[total]", value 20px weight 500 color #2E7D32).
3. THE Selected_Day_Card SHALL display a "Ver Resumo Completo" button with filled primary style (background #7B2D2D, text color #FFFFFF, 13px weight 400, border radius 18px, height 36px, full width).
4. WHEN the Operator taps the "Ver Resumo Completo" button, THE Navigation_System SHALL navigate to the Full_Summary_Screen for the selected date.
5. THE Selected_Day_Card SHALL use background color #7B2D2D at 6% opacity, border radius 12px, padding 14px horizontal 16px vertical, column layout with gap 8px.
6. WHEN no day is explicitly selected, THE Selected_Day_Card SHALL default to displaying the current day's summary.

### Requirement 4: Calendar Modal with Day Selection

**User Story:** As an Operator, I want to open a calendar modal to browse months and select a specific day, so that I can view financial data for any day without cluttering the main screen.

#### Acceptance Criteria

1. WHEN the Operator taps the Date_Chip, THE Calendar_Modal SHALL open as a full-screen or bottom-sheet overlay above the Intermediate_Screen.
2. THE Calendar_Modal SHALL display the Date_Selector at the top with the current month and year in Portuguese (e.g., "Agosto 2026") with 16px weight 500 color #3D2020, centered between two chevron icons (24px, color #7B2D2D).
3. WHEN the Operator taps the left chevron (chevron_left), THE Calendar_Modal SHALL navigate to the previous month and update the calendar grid.
4. WHEN the Operator taps the right chevron (chevron_right), THE Calendar_Modal SHALL navigate to the next month and update the calendar grid.
5. THE Calendar_Modal SHALL display a Legend row with two indicators: an amber dot (#D4812B, 6px circle) with label "Dia com pedidos" (11px, color #8B6B5A) and a dark red dot (#831515, 6px circle) with label "Dia selecionado" (11px, color #8B6B5A), separated by gap 16px.
6. THE Calendar_Modal SHALL display the Calendar_Card with a grid of weekday headers "Dom Seg Ter Qua Qui Sex Sáb" and up to 6 week rows, using white background (#FFFFFF), border radius 12px, padding 12px, column layout with gap 4px.
7. THE Calendar_Card SHALL display each day number (14px, weight 400, color #3D2020) in a cell with center alignment, height 40px.
8. THE Calendar_Card SHALL display an Order_Indicator_Dot (amber #D4812B, 6px circle) below the day number for each day that has at least one order in the displayed month.
9. THE Calendar_Card SHALL display a Selected_Day_Dot (dark red #831515, 6px circle) below the currently selected day number.
10. WHEN the Operator taps a day cell, THE Calendar_Modal SHALL mark that day as selected, update the Date_Chip on the main screen, refresh the Monthly_Summary_Card and Selected_Day_Card with data for the selected day's month, and close the modal.
11. THE Calendar_Card SHALL only display days belonging to the currently displayed month, leaving cells for adjacent months empty.
12. THE Calendar_Modal SHALL provide a way to close without changing the selection (e.g., tapping outside or a close button).

### Requirement 5: Month Navigation within Calendar Modal

**User Story:** As an Operator, I want to navigate between months in the calendar modal, so that I can view and select days from past or future months.

#### Acceptance Criteria

1. WHEN the month changes in the Calendar_Modal via chevron navigation, THE Calendar_Modal SHALL update the calendar grid and Order_Indicator_Dots for the new month.
2. WHEN the Operator selects a day in a different month, THE Intermediate_Screen SHALL update both the Monthly_Summary_Card (with new month's accumulators) and the Selected_Day_Card (with the selected day's data).
3. IF the Operator closes the Calendar_Modal without selecting a day after navigating months, THEN the Intermediate_Screen SHALL retain the previously selected day and month.

### Requirement 6: Monthly Summary API Endpoint

**User Story:** As an Operator, I want the app to fetch monthly accumulated data and per-day breakdowns efficiently, so that the calendar screen loads with all necessary information.

#### Acceptance Criteria

1. THE Summary_API SHALL provide a GET endpoint at `/api/summary/monthly` that accepts query parameters `year` (integer) and `month` (integer, 1-12).
2. WHEN the endpoint receives a valid request, THE Summary_API SHALL return the monthly accumulated totals: total orders count, total revenue (paid + pending in cents), total received (paid in cents), and total pending (in cents).
3. WHEN the endpoint receives a valid request, THE Summary_API SHALL return a per-day breakdown array containing, for each day that has at least one order: the day number, order count, revenue (in cents), and paid order count.
4. IF the `year` or `month` parameter is missing or invalid, THEN THE Summary_API SHALL return HTTP 400 with error code "INVALID_PARAMS" and a descriptive message.
5. THE Summary_API SHALL calculate all dates using the America/Sao_Paulo timezone.
6. THE Summary_API SHALL require authentication (authMiddleware) and user sync (syncUserMiddleware) before processing the request.

### Requirement 7: Real-Time Data Updates

**User Story:** As an Operator, I want the accumulated totals and calendar indicators to update automatically when new orders or payments happen, so that I always see current figures.

#### Acceptance Criteria

1. WHEN a new order event is received on the "orders:queue" channel, THE Intermediate_Screen SHALL refresh the Monthly_Summary_Card and Calendar_Card data for the currently displayed month.
2. WHEN a payment event is received on the "orders:payment" channel, THE Intermediate_Screen SHALL refresh the Monthly_Summary_Card and Selected_Day_Card data.
3. THE Intermediate_Screen SHALL support pull-to-refresh to manually reload all displayed data.

### Requirement 8: Loading and Error States

**User Story:** As an Operator, I want clear feedback when data is loading or when an error occurs, so that I understand the current state of the screen.

#### Acceptance Criteria

1. WHILE the Intermediate_Screen is fetching data, THE Intermediate_Screen SHALL display a loading indicator.
2. IF the data fetch fails, THEN THE Intermediate_Screen SHALL display an error message with a "Tentar novamente" (retry) button.
3. WHEN the Operator taps the "Tentar novamente" button, THE Intermediate_Screen SHALL retry the data fetch.

### Requirement 9: Visual Consistency with Design System

**User Story:** As an Operator, I want the screen to follow the app's visual design system, so that the experience feels cohesive.

#### Acceptance Criteria

1. THE Intermediate_Screen SHALL use the application theme tokens (colors, typography, spacing, border radius) from the ThemeProvider.
2. THE Intermediate_Screen SHALL arrange main content (Date_Chip, Monthly_Summary_Card, Selected_Day_Card) in a scrollable column layout with 16px padding on all sides and 16px gap between sections.
3. THE Intermediate_Screen SHALL use Material Icons for all iconography ("calendar_month", "receipt_long", "payments", "check_circle", "schedule", "chevron_left", "chevron_right").
4. THE Intermediate_Screen SHALL display a standard bottom navigation tab bar below the content area.
5. THE Calendar_Modal SHALL visually overlay the Intermediate_Screen with a semi-transparent backdrop.
