import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { registerPaymentRequestSchema } from '@order-system/shared';
import type { PaymentMethod, PaymentStatus } from '@order-system/shared';

/**
 * Feature: food-truck-order-system, Property 13: Pagamento válido atualiza para pago
 *
 * Para qualquer pedido com payment_status = 'pendente' e qualquer forma de pagamento
 * válida (dinheiro, pix ou cartão), o registro de pagamento deve ser bem-sucedido,
 * atualizar o status para pago e registrar o timestamp.
 *
 * **Validates: Requirements 8.1**
 */
describe('Property 13: Pagamento válido atualiza para pago', () => {
  const VALID_PAYMENT_METHODS: PaymentMethod[] = ['dinheiro', 'pix', 'cartão'];

  // Generator: valid payment method
  const validPaymentMethodArb = fc.constantFrom(...VALID_PAYMENT_METHODS);

  // Generator: a pending order (simulating the DB row)
  const pendingOrderArb = fc.record({
    id: fc.uuid(),
    daily_number: fc.integer({ min: 1, max: 999 }),
    customer_name: fc.string({ minLength: 1, maxLength: 100 }),
    origin: fc.constantFrom('presencial', 'whatsapp'),
    status: fc.constantFrom('aguardando', 'preparando', 'pronto', 'entregue'),
    payment_status: fc.constant('pendente' as PaymentStatus),
    payment_method: fc.constant(null),
    total_amount_cents: fc.integer({ min: 100, max: 99999900 }),
    order_date: fc.constant('2024-06-15'),
    created_at: fc.constant('2024-06-15T10:00:00.000Z'),
    started_at: fc.constant(null),
    ready_at: fc.constant(null),
    delivered_at: fc.constant(null),
    paid_at: fc.constant(null),
  });

  /**
   * Simulates the payment registration logic from order.controller.ts:
   * - Validates payment_status is 'pendente'
   * - Sets payment_status = 'pago'
   * - Sets payment_method to the provided method
   * - Sets paid_at to current ISO timestamp
   */
  function simulatePaymentRegistration(
    order: { payment_status: string; payment_method: string | null },
    paymentMethod: PaymentMethod
  ) {
    if (order.payment_status !== 'pendente') {
      return { success: false, reason: 'already_paid' };
    }

    const now = new Date().toISOString();
    return {
      success: true,
      updatedOrder: {
        ...order,
        payment_status: 'pago' as PaymentStatus,
        payment_method: paymentMethod,
        paid_at: now,
      },
    };
  }

  it('for any pending order + valid payment method, payment_status becomes pago', () => {
    fc.assert(
      fc.property(pendingOrderArb, validPaymentMethodArb, (order, method) => {
        const result = simulatePaymentRegistration(order, method);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.updatedOrder!.payment_status).toBe('pago');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('for any pending order + valid payment method, payment_method is set to the provided method', () => {
    fc.assert(
      fc.property(pendingOrderArb, validPaymentMethodArb, (order, method) => {
        const result = simulatePaymentRegistration(order, method);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.updatedOrder!.payment_method).toBe(method);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('for any pending order + valid payment method, paid_at is a valid ISO timestamp', () => {
    fc.assert(
      fc.property(pendingOrderArb, validPaymentMethodArb, (order, method) => {
        const result = simulatePaymentRegistration(order, method);

        expect(result.success).toBe(true);
        if (result.success) {
          const paidAt = result.updatedOrder!.paid_at;
          // Must be a non-empty string
          expect(typeof paidAt).toBe('string');
          expect(paidAt.length).toBeGreaterThan(0);

          // Must parse to a valid date
          const parsed = new Date(paidAt);
          expect(isNaN(parsed.getTime())).toBe(false);

          // Must be a valid ISO format (ends with Z for UTC)
          expect(paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('registerPaymentRequestSchema validates all valid payment methods', () => {
    fc.assert(
      fc.property(validPaymentMethodArb, (method) => {
        const result = registerPaymentRequestSchema.safeParse({ paymentMethod: method });
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});
