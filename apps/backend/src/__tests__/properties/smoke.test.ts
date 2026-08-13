import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Smoke test to verify fast-check + Vitest integration works correctly.
 * Feature: food-truck-order-system, Property: smoke-test
 */
describe('fast-check smoke test (backend)', () => {
  it('should verify fast-check runs with minimum 100 iterations', () => {
    let iterations = 0;

    fc.assert(
      fc.property(fc.integer(), (n) => {
        iterations++;
        return n + 0 === n;
      }),
      { numRuns: 100 }
    );

    expect(iterations).toBeGreaterThanOrEqual(100);
  });

  it('should verify string property works', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        return typeof s === 'string';
      }),
      { numRuns: 100 }
    );
  });

  it('should verify array property works', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (arr) => {
        return Array.isArray(arr) && arr.every((x) => typeof x === 'number');
      }),
      { numRuns: 100 }
    );
  });
});
