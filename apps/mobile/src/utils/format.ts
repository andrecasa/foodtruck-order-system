import type { DailySummary } from '@order-system/shared';

/** Formats price in centavos to R$ X,XX using pt-BR locale */
export function formatPrice(priceInCentavos: number): string {
  return (priceInCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/** Computes total revenue (paid + pending) from a DailySummary */
export function computeTotalRevenue(summary: DailySummary): number {
  return summary.paidTotal + summary.pendingTotal;
}

const PORTUGUESE_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Returns Portuguese month name for 1-based month number */
export function getPortugueseMonthName(month: number): string {
  return PORTUGUESE_MONTHS[month - 1] ?? '';
}

/** Formats date as "[dia] de [Mês], [Ano]" e.g. "15 de Agosto, 2026" */
export function formatSelectedDate(day: number, month: number, year: number): string {
  return `${day} de ${getPortugueseMonthName(month)}, ${year}`;
}
