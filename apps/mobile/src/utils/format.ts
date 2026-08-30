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

/**
 * "Pedido criado há X" label from an ISO createdAt, relative to now.
 * Mirrors the operator PaymentScreen wording:
 *   < 1 min  → "Pedido criado agora"
 *   < 60 min → "Pedido criado há {m} min"
 *   otherwise → "Pedido criado há {h}h {m}min" (omits minutes when 0)
 *
 * @param createdAt ISO timestamp string
 * @param now epoch ms to compare against (defaults to Date.now(); injectable for tests)
 */
export function formatOrderAge(createdAt: string, now: number = Date.now()): string {
  const createdMs = new Date(createdAt).getTime();
  const totalMinutes = Math.floor((now - createdMs) / 60000);
  if (!Number.isFinite(totalMinutes) || totalMinutes < 1) return 'Pedido criado agora';
  if (totalMinutes < 60) return `Pedido criado há ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `Pedido criado há ${hours}h ${mins}min` : `Pedido criado há ${hours}h`;
}
