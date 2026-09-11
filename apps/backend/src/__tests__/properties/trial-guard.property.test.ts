import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { isTrialBlocked } from '../../services/trial-guard.js';

/**
 * Feature: landing-onboarding, Property 13: Bloqueio do Trial_Guard
 *
 * Para qualquer tenant, `isTrialBlocked` SHALL bloquear o acesso (login, painel,
 * app e customer-ordering) se e somente se o tenant NÃO estiver convertido
 * (`subscriptionStatus !== 'active'`) E possuir `trialEndsAt` definido e parseável
 * com `trialEndsAt <= now`; em qualquer outro caso (trial vigente, `trialEndsAt`
 * ausente/inválido, ou tenant convertido) o acesso SHALL ser permitido.
 *
 * A propriedade valida a bicondicional completa contra um oráculo independente,
 * derivado diretamente das regras de negócio (R12.4/R12.5/R12.6), sobre um espaço
 * de entrada amplo: `subscriptionStatus` (incluindo `'trial'`, `'active'`,
 * `'canceled'`, `null` e strings arbitrárias), `trialEndsAt` (`null`, passado,
 * agora e futuro — como `Date` e como string ISO devolvida pelo driver `pg`) e
 * `now`.
 *
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8**
 */

const CONVERTED = 'active';

// Instante base arbitrário (`now`), em ms desde a epoch. Intervalo amplo mas
// finito para manter as datas derivadas dentro do range válido de `Date`.
const nowMsArb = fc.integer({ min: 0, max: 4_102_444_800_000 }); // até ~2100

// `subscriptionStatus`: cobre o convertido ('active'), os não convertidos
// conhecidos ('trial'/'canceled'/null), e strings arbitrárias (não convertidas).
const subscriptionStatusArb: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant('active'),
  fc.constant('trial'),
  fc.constant('canceled'),
  fc.constant(null),
  fc.constant(undefined),
  fc.string({ maxLength: 20 }),
);

/**
 * Delta (em ms) relativo a `now` usado para posicionar `trialEndsAt` no passado,
 * exatamente em `now` (fronteira R12.5) ou no futuro.
 */
const deltaMsArb = fc.oneof(
  fc.integer({ min: -1_000_000_000, max: -1 }), // passado (expirado)
  fc.constant(0), // fronteira: trialEndsAt == now ⇒ expirado
  fc.integer({ min: 1, max: 1_000_000_000 }), // futuro (vigente)
);

/**
 * Gera um `trialEndsAt` a partir de `now + delta`, ora como `Date`, ora como
 * string ISO (formato devolvido pelo `pg`), e também os casos "sem trial"
 * (`null`/`undefined`) e uma string não parseável (tratada como sem trial).
 */
const trialEndsAtArb = (nowMs: number): fc.Arbitrary<Date | string | null | undefined> =>
  fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.constant('not-a-date'),
    deltaMsArb.map((delta) => new Date(nowMs + delta)),
    deltaMsArb.map((delta) => new Date(nowMs + delta).toISOString()),
  );

/**
 * Oráculo independente da bicondicional: bloqueia sse não convertido E
 * `trialEndsAt` parseável E `trialEndsAt <= now`.
 */
function expectedBlocked(
  trialEndsAt: Date | string | null | undefined,
  subscriptionStatus: string | null | undefined,
  now: Date,
): boolean {
  if (subscriptionStatus === CONVERTED) return false;
  if (trialEndsAt == null) return false;
  const ms = trialEndsAt instanceof Date ? trialEndsAt.getTime() : new Date(trialEndsAt).getTime();
  if (Number.isNaN(ms)) return false;
  return ms <= now.getTime();
}

describe('Feature: landing-onboarding, Property 13: Bloqueio do Trial_Guard', () => {
  it('bloqueia se e somente se não convertido E trial expirado (bicondicional completa)', () => {
    fc.assert(
      fc.property(
        nowMsArb,
        subscriptionStatusArb,
        fc.integer({ min: 0, max: 4 }),
        (nowMs, subscriptionStatus, _seed) => {
          const now = new Date(nowMs);
          return fc.assert(
            fc.property(trialEndsAtArb(nowMs), (trialEndsAt) => {
              const actual = isTrialBlocked({ trialEndsAt, subscriptionStatus, now });
              const expected = expectedBlocked(trialEndsAt, subscriptionStatus, now);
              expect(actual).toBe(expected);
            }),
            { numRuns: 30 },
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('tenant convertido (active) nunca é bloqueado, mesmo com trial expirado', () => {
    fc.assert(
      fc.property(nowMsArb, fc.integer({ min: -1_000_000_000, max: 0 }), (nowMs, delta) => {
        const now = new Date(nowMs);
        const trialEndsAt = new Date(nowMs + delta); // no passado ou exatamente agora
        expect(isTrialBlocked({ trialEndsAt, subscriptionStatus: 'active', now })).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('trial ausente (null/undefined) nunca é bloqueado, qualquer que seja o status', () => {
    fc.assert(
      fc.property(
        nowMsArb,
        subscriptionStatusArb,
        fc.constantFrom<null | undefined>(null, undefined),
        (nowMs, subscriptionStatus, trialEndsAt) => {
          const now = new Date(nowMs);
          expect(isTrialBlocked({ trialEndsAt, subscriptionStatus, now })).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('trial expirado + não convertido é bloqueado (Date e ISO string)', () => {
    fc.assert(
      fc.property(
        nowMsArb,
        fc.constantFrom<string | null>('trial', 'canceled', null),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.boolean(),
        (nowMs, subscriptionStatus, past, asIso) => {
          const now = new Date(nowMs);
          const date = new Date(nowMs - past); // estritamente no passado
          const trialEndsAt = asIso ? date.toISOString() : date;
          expect(isTrialBlocked({ trialEndsAt, subscriptionStatus, now })).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('trial futuro (vigente) não é bloqueado, mesmo não convertido', () => {
    fc.assert(
      fc.property(
        nowMsArb,
        fc.constantFrom<string | null>('trial', 'canceled', null),
        fc.integer({ min: 1, max: 1_000_000_000 }),
        fc.boolean(),
        (nowMs, subscriptionStatus, future, asIso) => {
          const now = new Date(nowMs);
          const date = new Date(nowMs + future); // estritamente no futuro
          const trialEndsAt = asIso ? date.toISOString() : date;
          expect(isTrialBlocked({ trialEndsAt, subscriptionStatus, now })).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('fronteira: trialEndsAt == now + não convertido é bloqueado', () => {
    fc.assert(
      fc.property(nowMsArb, fc.constantFrom<string | null>('trial', 'canceled', null), (nowMs, subscriptionStatus) => {
        const now = new Date(nowMs);
        // Mesma instância de instante, tanto como Date quanto como ISO string.
        expect(isTrialBlocked({ trialEndsAt: new Date(nowMs), subscriptionStatus, now })).toBe(true);
        expect(
          isTrialBlocked({ trialEndsAt: new Date(nowMs).toISOString(), subscriptionStatus, now }),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});
