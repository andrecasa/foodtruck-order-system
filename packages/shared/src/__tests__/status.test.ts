import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  VALID_TRANSITIONS,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  ORDER_ORIGINS,
  PAYMENT_METHODS,
} from '../constants/status';

describe('isValidTransition', () => {
  it('allows aguardando → preparando', () => {
    expect(isValidTransition('aguardando', 'preparando')).toBe(true);
  });

  it('allows preparando → pronto', () => {
    expect(isValidTransition('preparando', 'pronto')).toBe(true);
  });

  it('allows pronto → entregue', () => {
    expect(isValidTransition('pronto', 'entregue')).toBe(true);
  });

  it('rejects backwards transitions', () => {
    expect(isValidTransition('preparando', 'aguardando')).toBe(false);
    expect(isValidTransition('pronto', 'preparando')).toBe(false);
    expect(isValidTransition('entregue', 'pronto')).toBe(false);
  });

  it('rejects skipping transitions', () => {
    expect(isValidTransition('aguardando', 'pronto')).toBe(false);
    expect(isValidTransition('aguardando', 'entregue')).toBe(false);
    expect(isValidTransition('preparando', 'entregue')).toBe(false);
  });

  it('rejects same-status transitions', () => {
    for (const status of ORDER_STATUSES) {
      expect(isValidTransition(status, status)).toBe(false);
    }
  });

  it('rejects transitions from entregue (terminal state)', () => {
    for (const status of ORDER_STATUSES) {
      expect(isValidTransition('entregue', status)).toBe(false);
    }
  });
});

describe('constants', () => {
  it('ORDER_STATUSES contains all 4 statuses', () => {
    expect(ORDER_STATUSES).toEqual(['aguardando', 'preparando', 'pronto', 'entregue']);
  });

  it('PAYMENT_STATUSES contains pendente and pago', () => {
    expect(PAYMENT_STATUSES).toEqual(['pendente', 'pago']);
  });

  it('ORDER_ORIGINS contains presencial and whatsapp', () => {
    expect(ORDER_ORIGINS).toEqual(['presencial', 'whatsapp']);
  });

  it('PAYMENT_METHODS contains dinheiro, pix, cartão', () => {
    expect(PAYMENT_METHODS).toEqual(['dinheiro', 'pix', 'cartão']);
  });

  it('VALID_TRANSITIONS maps exactly 3 transitions', () => {
    expect(Object.keys(VALID_TRANSITIONS)).toHaveLength(3);
  });
});
