/**
 * Trial_Guard — predicado puro de bloqueio de acesso pós-teste (R12).
 *
 * Um tenant em teste gratuito permanece com `status = 'ativo'` (o enum `status`
 * não representa o trial, R12.6). A conversão para assinante pago é representada
 * por `subscription_status`, ortogonal a `status`: um tenant é considerado
 * **convertido** quando, e somente quando, `subscription_status === 'active'`.
 *
 * `isTrialBlocked` concentra a regra em um único ponto puro (sem I/O), reutilizado
 * pelas extensões do `tenant.middleware` (painel/app, R12.2/R12.3), do
 * `public-tenant.middleware` (customer-ordering por slug, R12.7) e do
 * `auth.controller.login` (R12.1). Ele bloqueia o acesso **se e somente se**:
 *
 *   1. o tenant NÃO está convertido (`subscription_status !== 'active'`), E
 *   2. possui `trial_ends_at` definido (não nulo), E
 *   3. o fim do teste já passou ou é agora (`trial_ends_at <= now`, R12.5).
 *
 * Em qualquer outro caso (trial vigente, `trial_ends_at` ausente/legado, ou
 * tenant convertido) o acesso é permitido (R12.4/R12.8). Tenants legados sem
 * `trial_ends_at` nunca são bloqueados por trial, preservando o comportamento
 * atual.
 *
 * Design: `.kiro/specs/landing-onboarding/design.md` (Trial_Guard; Correctness
 * Property 13).
 * Requirements: 12.4, 12.5, 12.6.
 */

/** Valor de `subscription_status` que representa um tenant convertido (R12.6). */
const CONVERTED_SUBSCRIPTION_STATUS = 'active';

/** Entrada do predicado de bloqueio do Trial_Guard. */
export interface TrialGuardInput {
  /**
   * Instante de expiração do teste (`tenants.trial_ends_at`). `null`/`undefined`
   * ⇒ tenant sem trial (legado) ⇒ nunca bloqueado por trial. Aceita `Date` ou a
   * string ISO devolvida pelo driver `pg`.
   */
  trialEndsAt: Date | string | null | undefined;
  /**
   * Indicador de conversão (`tenants.subscription_status`). `'active'` ⇒
   * convertido (nunca bloqueado). Qualquer outro valor (`'trial'`, `'canceled'`,
   * `null`) ⇒ não convertido.
   */
  subscriptionStatus: string | null | undefined;
  /** Instante atual usado na comparação com `trialEndsAt`. */
  now: Date;
}

/**
 * Normaliza `trialEndsAt` para epoch em ms, ou `null` quando ausente/ inválido.
 * Datas inválidas são tratadas como "sem trial" (não bloqueia), coerente com o
 * tratamento de tenant legado.
 */
function toEpochMs(value: Date | string | null | undefined): number | null {
  if (value == null) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Retorna `true` se e somente se o acesso do tenant deve ser bloqueado por teste
 * expirado e sem conversão (R12.4/R12.5/R12.6). Função pura, sem efeitos.
 */
export function isTrialBlocked({
  trialEndsAt,
  subscriptionStatus,
  now,
}: TrialGuardInput): boolean {
  const isConverted = subscriptionStatus === CONVERTED_SUBSCRIPTION_STATUS;
  if (isConverted) return false;

  const trialEndsAtMs = toEpochMs(trialEndsAt);
  if (trialEndsAtMs === null) return false;

  return trialEndsAtMs <= now.getTime();
}

/**
 * Códigos/mensagens pt-BR do bloqueio por trial, para uso ao lançar o
 * `ServiceError` nos pontos de acesso. Cada entrada expõe `statusCode` (403),
 * `code` estável e a `message` exibível ao cliente.
 */
export const TRIAL_EXPIRED = {
  statusCode: 403,
  code: 'TRIAL_EXPIRED',
  message: 'Seu período de teste gratuito expirou. Entre em contato para continuar usando o sistema.',
} as const;

export const ESTABLISHMENT_UNAVAILABLE = {
  statusCode: 403,
  code: 'ESTABLISHMENT_UNAVAILABLE',
  message: 'Este estabelecimento está indisponível no momento.',
} as const;
