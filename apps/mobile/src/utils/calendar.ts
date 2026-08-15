import type { DayBreakdown } from '@order-system/shared';

/** Returns the number of days in a given month (1-based) */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Returns the weekday index (0=Sunday) of the first day of the month */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Given per-day breakdown, returns the default selected day:
 * today's day if viewing the current month/year, otherwise day 1.
 */
export function getDefaultSelectedDay(days: DayBreakdown[], year?: number, month?: number): number {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentDay = now.getDate();

  // If viewing the current month, select today
  if (year === currentYear && month === currentMonth) {
    return currentDay;
  }

  // If no year/month provided, assume current month → return today
  if (year === undefined || month === undefined) {
    return currentDay;
  }

  // Different month: default to day 1
  return 1;
}

/** Generates calendar grid rows for a given month */
export function generateCalendarGrid(year: number, month: number): (number | null)[][] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = getFirstDayOfMonth(year, month);
  const rows: (number | null)[][] = [];
  let currentDay = 1;

  for (let week = 0; week < 6; week++) {
    const row: (number | null)[] = [];
    for (let dow = 0; dow < 7; dow++) {
      if (week === 0 && dow < firstWeekday) {
        row.push(null);
      } else if (currentDay > daysInMonth) {
        row.push(null);
      } else {
        row.push(currentDay);
        currentDay++;
      }
    }
    rows.push(row);
    if (currentDay > daysInMonth) break;
  }
  return rows;
}
