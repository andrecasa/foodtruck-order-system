import { describe, it, expect } from 'vitest';

import {
  isTrialBlocked,
  TRIAL_EXPIRED,
  ESTABLISHMENT_UNAVAILABLE,
} from '../../services/trial-guard.js';

/**
 * Tarefa 10.1 — Trial_Guard: predicado puro `isTrialBlocked`.
 *
 * Cobre a tabela-verdade do bloqueio pós-teste: um tenant é bloqueado se e
 * somente se NÃO está convertido (`subscription_status !== 'active'`) E possui
 * `trial_ends_at` definido E `trial_ends_at <= now`. Também valida os
 * códigos/mensagens pt-BR expostos (`TRIAL_EXPIRED`, `ESTABLISHMENT_UNAVAILABLE`).
 *
 * **Validates: Requirements 12.4, 12.5, 12.6**
 */
describe('isTrialBlocked (Trial_Guard, R12.4/12.5/12.6)', () => {
  const now = new Date('2025-06-15T12:00:00.000Z');
  const past = new Date('2025-06-14T12:00:00.000Z');
  const future = new Date('2025-06-16T12:00:00.000Z');

  it('tenant convertido (active) nunca é bloqueado, mesmo com trial expirado', () => {
    expect(
      isTrialBlocked({ trialEndsAt: past, subscriptionStatus: 'active', now }),
    ).toBe(false);
  });

  it('tenant sem trial_ends_at (legado) nunca é bloqueado', () => {
    expect(
      isTrialBlocked({ trialEndsAt: null, subscriptionStatus: 'trial', now }),
    ).toBe(false);
    expect(
      isTrialBlocked({ trialEndsAt: undefined, subscriptionStatus: 'trial', now }),
    ).toBe(false);
  });

  it('tenant não convertido com trial expirado (passado) é bloqueado', () => {
    expect(
      isTrialBlocked({ trialEndsAt: past, subscriptionStatus: 'trial', now }),
    ).toBe(true);
    expect(
      isTrialBlocked({ trialEndsAt: past, subscriptionStatus: 'canceled', now }),
    ).toBe(true);
    expect(
      isTrialBlocked({ trialEndsAt: past, subscriptionStatus: null, now }),
    ).toBe(true);
  });

  it('tenant não convertido com trial vigente (futuro) não é bloqueado', () => {
    expect(
      isTrialBlocked({ trialEndsAt: future, subscriptionStatus: 'trial', now }),
    ).toBe(false);
  });

  it('no limite (trial_ends_at == now) o tenant não convertido é bloqueado (R12.5, <=)', () => {
    expect(
      isTrialBlocked({ trialEndsAt: new Date(now), subscriptionStatus: 'trial', now }),
    ).toBe(true);
  });

  it('aceita trial_ends_at como string ISO (formato devolvido pelo driver pg)', () => {
    expect(
      isTrialBlocked({ trialEndsAt: past.toISOString(), subscriptionStatus: 'trial', now }),
    ).toBe(true);
    expect(
      isTrialBlocked({ trialEndsAt: future.toISOString(), subscriptionStatus: 'trial', now }),
    ).toBe(false);
  });

  it('trial_ends_at inválido é tratado como sem trial (não bloqueia)', () => {
    expect(
      isTrialBlocked({ trialEndsAt: 'não-é-data', subscriptionStatus: 'trial', now }),
    ).toBe(false);
  });
});

describe('códigos/mensagens pt-BR do Trial_Guard', () => {
  it('TRIAL_EXPIRED expõe status 403, código estável e mensagem pt-BR', () => {
    expect(TRIAL_EXPIRED.statusCode).toBe(403);
    expect(TRIAL_EXPIRED.code).toBe('TRIAL_EXPIRED');
    expect(TRIAL_EXPIRED.message).toMatch(/teste gratuito/i);
  });

  it('ESTABLISHMENT_UNAVAILABLE expõe status 403, código estável e mensagem pt-BR', () => {
    expect(ESTABLISHMENT_UNAVAILABLE.statusCode).toBe(403);
    expect(ESTABLISHMENT_UNAVAILABLE.code).toBe('ESTABLISHMENT_UNAVAILABLE');
    expect(ESTABLISHMENT_UNAVAILABLE.message).toMatch(/indisponível/i);
  });
});
