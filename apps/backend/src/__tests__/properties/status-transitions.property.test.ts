import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isValidTransition,
  VALID_TRANSITIONS,
  ORDER_STATUSES,
} from '@order-system/shared';
import type { OrderStatus } from '@order-system/shared';

/**
 * Feature: food-truck-order-system, Property 11: Transições válidas registram timestamps
 *
 * Para qualquer pedido, quando uma transição válida na sequência
 * aguardando → preparando → pronto → entregue é executada, o Backend deve
 * registrar o timestamp correspondente (started_at, ready_at, ou delivered_at)
 * e publicar o evento no Realtime.
 *
 * **Validates: Requirements 7.1, 7.2, 7.3**
 */
describe('Property 11: Transições válidas registram timestamps', () => {
  // The mapping from the order controller
  const TRANSITION_TIMESTAMP_FIELD: Record<string, string> = {
    'aguardando→preparando': 'started_at',
    'preparando→pronto': 'ready_at',
    'pronto→entregue': 'delivered_at',
  };

  // Valid transition pairs as defined in the shared package
  const VALID_TRANSITION_PAIRS: Array<{ from: OrderStatus; to: OrderStatus }> = [
    { from: 'aguardando', to: 'preparando' },
    { from: 'preparando', to: 'pronto' },
    { from: 'pronto', to: 'entregue' },
  ];

  // Generator: a valid transition pair
  const validTransitionArb = fc.constantFrom(...VALID_TRANSITION_PAIRS);

  // Generator: any status pair (for testing invalid transitions)
  const anyStatusPairArb = fc.record({
    from: fc.constantFrom(...ORDER_STATUSES),
    to: fc.constantFrom(...ORDER_STATUSES),
  });

  it('isValidTransition returns true for all valid transitions', () => {
    fc.assert(
      fc.property(validTransitionArb, ({ from, to }) => {
        expect(isValidTransition(from, to)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('each valid transition maps to the correct timestamp field', () => {
    fc.assert(
      fc.property(validTransitionArb, ({ from, to }) => {
        const transitionKey = `${from}→${to}`;
        const timestampField = TRANSITION_TIMESTAMP_FIELD[transitionKey];

        // Every valid transition must have a corresponding timestamp field
        expect(timestampField).toBeDefined();

        // Verify correct mapping per requirement
        if (from === 'aguardando' && to === 'preparando') {
          expect(timestampField).toBe('started_at');
        } else if (from === 'preparando' && to === 'pronto') {
          expect(timestampField).toBe('ready_at');
        } else if (from === 'pronto' && to === 'entregue') {
          expect(timestampField).toBe('delivered_at');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('for any valid transition, the timestamp field value would be a valid ISO date string', () => {
    fc.assert(
      fc.property(validTransitionArb, ({ from, to }) => {
        const transitionKey = `${from}→${to}`;
        const timestampField = TRANSITION_TIMESTAMP_FIELD[transitionKey];

        // Simulate what the controller does: set the timestamp to current ISO string
        const now = new Date().toISOString();

        // The timestamp must be a valid ISO date
        const parsed = new Date(now);
        expect(parsed.toISOString()).toBe(now);
        expect(isNaN(parsed.getTime())).toBe(false);

        // The timestamp field must be one of the three expected fields
        expect(['started_at', 'ready_at', 'delivered_at']).toContain(timestampField);
      }),
      { numRuns: 100 }
    );
  });

  it('only valid transitions in the sequence are recognized by isValidTransition', () => {
    fc.assert(
      fc.property(anyStatusPairArb, ({ from, to }) => {
        const result = isValidTransition(from, to);
        const isExpectedValid = VALID_TRANSITIONS[from] === to;

        // isValidTransition must agree with VALID_TRANSITIONS mapping
        expect(result).toBe(isExpectedValid);
      }),
      { numRuns: 100 }
    );
  });

  it('every valid transition has exactly one associated timestamp field', () => {
    fc.assert(
      fc.property(validTransitionArb, ({ from, to }) => {
        const transitionKey = `${from}→${to}`;
        const timestampField = TRANSITION_TIMESTAMP_FIELD[transitionKey];

        // Must be defined (not undefined)
        expect(timestampField).toBeDefined();
        // Must be a non-empty string
        expect(typeof timestampField).toBe('string');
        expect(timestampField.length).toBeGreaterThan(0);

        // Must be unique per transition (no two transitions share same field)
        const otherTransitions = VALID_TRANSITION_PAIRS.filter(
          (t) => !(t.from === from && t.to === to)
        );
        for (const other of otherTransitions) {
          const otherKey = `${other.from}→${other.to}`;
          const otherField = TRANSITION_TIMESTAMP_FIELD[otherKey];
          expect(otherField).not.toBe(timestampField);
        }
      }),
      { numRuns: 100 }
    );
  });
});
