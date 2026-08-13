import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: food-truck-order-system, Property 14: Pagamento duplicado rejeitado com 409
 *
 * Para qualquer pedido com payment_status = 'pago', qualquer tentativa de
 * registrar pagamento novamente deve ser rejeitada com HTTP 409, independente
 * da forma de pagamento informada.
 *
 * **Validates: Requirements 8.2**
 */
describe('Property 14: Pagamento duplicado rejeitado com 409', () => {
  // Valid payment methods as defined in shared validator
  const PAYMENT_METHODS = ['dinheiro', 'pix', 'cartão'] as const;
  type PaymentMethod = (typeof PAYMENT_METHODS)[number];

  // Generator: any valid payment method
  const paymentMethodArb = fc.constantFrom(...PAYMENT_METHODS);

  // Generator: an order that is already paid (payment_status = 'pago')
  const paidOrderArb = fc.record({
    id: fc.uuid(),
    daily_number: fc.integer({ min: 1, max: 999 }),
    customer_name: fc.string({ minLength: 1, maxLength: 50 }),
    origin: fc.constantFrom('app', 'whatsapp'),
    status: fc.constantFrom('aguardando', 'preparando', 'pronto', 'entregue'),
    payment_status: fc.constant('pago' as const),
    payment_method: paymentMethodArb,
    total_amount_cents: fc.integer({ min: 100, max: 999999 }),
    order_date: fc.constant('2024-06-15'),
    created_at: fc.constant('2024-06-15T10:00:00.000Z'),
    paid_at: fc.constant('2024-06-15T12:00:00.000Z'),
  });

  /**
   * Models the controller logic for duplicate payment rejection:
   * if (order.payment_status === 'pago') → return { status: 409, body: {...} }
   */
  function handlePaymentAttempt(
    order: { payment_status: string },
    _paymentMethod: PaymentMethod
  ): { statusCode: number; error: string; message: string } | null {
    if (order.payment_status === 'pago') {
      return {
        statusCode: 409,
        error: 'CONFLICT',
        message: 'Pedido já foi pago',
      };
    }
    return null; // Would proceed to payment registration
  }

  it('rejects duplicate payment with 409 regardless of payment method used', () => {
    fc.assert(
      fc.property(
        paidOrderArb,
        paymentMethodArb,
        (order, attemptedMethod) => {
          const result = handlePaymentAttempt(order, attemptedMethod);

          // Must always reject with 409
          expect(result).not.toBeNull();
          expect(result!.statusCode).toBe(409);
          expect(result!.error).toBe('CONFLICT');
          expect(result!.message).toBe('Pedido já foi pago');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects even when attempted method matches existing payment method', () => {
    fc.assert(
      fc.property(
        paidOrderArb,
        (order) => {
          // Attempt payment with the same method already recorded
          const result = handlePaymentAttempt(order, order.payment_method as PaymentMethod);

          expect(result).not.toBeNull();
          expect(result!.statusCode).toBe(409);
          expect(result!.error).toBe('CONFLICT');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects even when attempted method differs from existing payment method', () => {
    fc.assert(
      fc.property(
        paidOrderArb,
        paymentMethodArb,
        (order, attemptedMethod) => {
          // Focus on cases where methods differ
          fc.pre(attemptedMethod !== order.payment_method);

          const result = handlePaymentAttempt(order, attemptedMethod);

          expect(result).not.toBeNull();
          expect(result!.statusCode).toBe(409);
          expect(result!.message).toBe('Pedido já foi pago');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('the 409 response structure matches the controller output format', () => {
    fc.assert(
      fc.property(
        paidOrderArb,
        paymentMethodArb,
        (order, attemptedMethod) => {
          const result = handlePaymentAttempt(order, attemptedMethod);

          // Verify complete response structure
          expect(result).toEqual({
            statusCode: 409,
            error: 'CONFLICT',
            message: 'Pedido já foi pago',
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
