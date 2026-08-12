import { describe, it, expect, beforeEach } from 'vitest';
import {
  rateLimitStore,
  recordFailedAttempt,
  resetRateLimit,
  getRateLimitEntry,
  rateLimitMiddleware,
} from '../../middleware/rate-limit.middleware.js';
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } from '@order-system/shared';
import { Request, Response } from 'express';

function mockRequest(ip = '127.0.0.1'): Partial<Request> {
  return {
    ip,
    headers: {},
    socket: { remoteAddress: ip } as any,
  };
}

function mockResponse(): Partial<Response> & { statusCode: number; body: any } {
  const res: any = {
    statusCode: 0,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    rateLimitStore.clear();
  });

  describe('recordFailedAttempt', () => {
    it('should increment attempts for an IP', () => {
      recordFailedAttempt('192.168.1.1');
      const entry = getRateLimitEntry('192.168.1.1');
      expect(entry).toBeDefined();
      expect(entry!.attempts).toBe(1);
      expect(entry!.blockedUntil).toBeNull();
    });

    it('should block after RATE_LIMIT_MAX_ATTEMPTS failed attempts', () => {
      for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
        recordFailedAttempt('192.168.1.1');
      }
      const entry = getRateLimitEntry('192.168.1.1');
      expect(entry).toBeDefined();
      expect(entry!.attempts).toBe(RATE_LIMIT_MAX_ATTEMPTS);
      expect(entry!.blockedUntil).not.toBeNull();
      expect(entry!.blockedUntil!).toBeGreaterThan(Date.now());
    });

    it('should set blockedUntil to current time + RATE_LIMIT_WINDOW_MS', () => {
      const before = Date.now();
      for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
        recordFailedAttempt('192.168.1.1');
      }
      const after = Date.now();
      const entry = getRateLimitEntry('192.168.1.1');
      expect(entry!.blockedUntil!).toBeGreaterThanOrEqual(before + RATE_LIMIT_WINDOW_MS);
      expect(entry!.blockedUntil!).toBeLessThanOrEqual(after + RATE_LIMIT_WINDOW_MS);
    });
  });

  describe('resetRateLimit', () => {
    it('should remove the entry for the IP', () => {
      recordFailedAttempt('192.168.1.1');
      expect(getRateLimitEntry('192.168.1.1')).toBeDefined();
      resetRateLimit('192.168.1.1');
      expect(getRateLimitEntry('192.168.1.1')).toBeUndefined();
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should call next when no entry exists for the IP', () => {
      const req = mockRequest('10.0.0.1');
      const res = mockResponse();
      let nextCalled = false;

      rateLimitMiddleware(req as Request, res as unknown as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should call next when attempts are below the limit', () => {
      recordFailedAttempt('10.0.0.2');
      recordFailedAttempt('10.0.0.2');

      const req = mockRequest('10.0.0.2');
      const res = mockResponse();
      let nextCalled = false;

      rateLimitMiddleware(req as Request, res as unknown as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });

    it('should return 429 when IP is blocked', () => {
      for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
        recordFailedAttempt('10.0.0.3');
      }

      const req = mockRequest('10.0.0.3');
      const res = mockResponse();
      let nextCalled = false;

      rateLimitMiddleware(req as Request, res as unknown as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(429);
      expect(res.body.error).toBe('TOO_MANY_ATTEMPTS');
      expect(res.body.message).toContain('Muitas tentativas');
    });

    it('should include remaining time in the 429 response message', () => {
      for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
        recordFailedAttempt('10.0.0.4');
      }

      const req = mockRequest('10.0.0.4');
      const res = mockResponse();

      rateLimitMiddleware(req as Request, res as unknown as Response, () => {});

      expect(res.body.message).toMatch(/\d+ minuto/);
    });

    it('should allow requests after the block window expires', () => {
      for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
        recordFailedAttempt('10.0.0.5');
      }

      // Manually expire the block
      const entry = getRateLimitEntry('10.0.0.5')!;
      entry.blockedUntil = Date.now() - 1000;

      const req = mockRequest('10.0.0.5');
      const res = mockResponse();
      let nextCalled = false;

      rateLimitMiddleware(req as Request, res as unknown as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
      // Entry should be deleted after expiry
      expect(getRateLimitEntry('10.0.0.5')).toBeUndefined();
    });

    it('should use x-forwarded-for header when available', () => {
      recordFailedAttempt('203.0.113.50');
      for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS - 1; i++) {
        recordFailedAttempt('203.0.113.50');
      }

      const req = mockRequest('127.0.0.1');
      (req as any).headers = { 'x-forwarded-for': '203.0.113.50, 10.0.0.1' };
      const res = mockResponse();
      let nextCalled = false;

      rateLimitMiddleware(req as Request, res as unknown as Response, () => {
        nextCalled = true;
      });

      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(429);
    });
  });
});
