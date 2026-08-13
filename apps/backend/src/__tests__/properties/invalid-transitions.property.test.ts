import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidTransition,
  VALID_TRANSITIONS,
  ORDER_STATUSES,
} from '@order-system/shared';
import type { OrderStatus } from '@order-system/shared';

/**
 * Feature: food-truck-order-system, Property 12: Transições inválidas rejeitadas com 422
 *
 * Para qualquer pedido com status S e qualquer status-alvo T onde T não é o
 * próximo válido na sequência aguardando → preparando → pronto → entregue,
 * a transição deve ser rejeitada com HTTP 422.
 *
 * **Validates: Requirements 7.4**
 */
describe('Property 12: Transições inválidas rejeitadas com 422', () => {
  // Build the complete list of invalid transition pairs
  const ALL_INVALID_PAIRS: Array<{ from: OrderStatus; to: OrderStatus }> = [];
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_STATUSES) {
      if (VALID_TRANSITIONS[from] !== to) {
        ALL_INVALID_PAIRS.push({ from, to });
      }
    }
  }

  // Generator: any invalid transition pair
  const invalidTransitionArb = fc.constantFrom(...ALL_INVALID_PAIRS);

  it('for any status pair (from, to) where to !== VALID_TRANSITIONS[from], isValidTransition returns false', () => {
    fc.assert(
      fc.property(invalidTransitionArb, ({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('backward transitions are invalid (entregue→pronto, pronto→preparando, preparando→aguardando)', () => {
    const backwardTransitions: Array<{ from: OrderStatus; to: OrderStatus }> = [
      { from: 'entregue', to: 'pronto' },
      { from: 'pronto', to: 'preparando' },
      { from: 'preparando', to: 'aguardando' },
      { from: 'entregue', to: 'preparando' },
      { from: 'entregue', to: 'aguardando' },
      { from: 'pronto', to: 'aguardando' },
    ];
    const backwardArb = fc.constantFrom(...backwardTransitions);

    fc.assert(
      fc.property(backwardArb, ({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('same-status transitions are invalid (S→S for all S)', () => {
    const sameStatusArb = fc.constantFrom(...ORDER_STATUSES);

    fc.assert(
      fc.property(sameStatusArb, (status) => {
        expect(isValidTransition(status, status)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('skip transitions are invalid (aguardando→pronto, aguardando→entregue, preparando→entregue)', () => {
    const skipTransitions: Array<{ from: OrderStatus; to: OrderStatus }> = [
      { from: 'aguardando', to: 'pronto' },
      { from: 'aguardando', to: 'entregue' },
      { from: 'preparando', to: 'entregue' },
    ];
    const skipArb = fc.constantFrom(...skipTransitions);

    fc.assert(
      fc.property(skipArb, ({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  it('entregue has no valid outgoing transition (terminal state)', () => {
    const toStatusArb = fc.constantFrom(...ORDER_STATUSES);

    fc.assert(
      fc.property(toStatusArb, (to) => {
        // entregue is a terminal state - no transition from it is valid
        expect(isValidTransition('entregue', to)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});
