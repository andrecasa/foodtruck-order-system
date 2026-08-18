import { describe, it, expect } from 'vitest';
import {
  MAX_QUANTITY,
  MIN_PRICE,
  MAX_PRICE,
  MAX_NAME_LENGTH,
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_WINDOW_MS,
  SESSION_DURATION_HOURS,
  WHATSAPP_SESSION_TIMEOUT_MS,
  REALTIME_RECONNECT_INTERVAL_MS,
} from '../constants/config';

describe('config constants', () => {
  it('MAX_QUANTITY is 99', () => {
    expect(MAX_QUANTITY).toBe(99);
  });

  it('MIN_PRICE is 1 (centavos)', () => {
    expect(MIN_PRICE).toBe(1);
  });

  it('MAX_PRICE is 999999 (centavos)', () => {
    expect(MAX_PRICE).toBe(999999);
  });

  it('MAX_NAME_LENGTH is 100', () => {
    expect(MAX_NAME_LENGTH).toBe(100);
  });

  it('RATE_LIMIT_MAX_ATTEMPTS is 5', () => {
    expect(RATE_LIMIT_MAX_ATTEMPTS).toBe(5);
  });

  it('RATE_LIMIT_WINDOW_MS is 15 minutes', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it('SESSION_DURATION_HOURS is 8', () => {
    expect(SESSION_DURATION_HOURS).toBe(8);
  });

  it('WHATSAPP_SESSION_TIMEOUT_MS is 10 minutes', () => {
    expect(WHATSAPP_SESSION_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });

  it('REALTIME_RECONNECT_INTERVAL_MS is 5 seconds', () => {
    expect(REALTIME_RECONNECT_INTERVAL_MS).toBe(5000);
  });
});
