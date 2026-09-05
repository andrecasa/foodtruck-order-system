import { type Request, type Response, type NextFunction } from 'express';
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } from '@order-system/shared';
import { getClientIp } from '../http/client-ip.js';

interface RateLimitEntry {
  attempts: number;
  blockedUntil: number | null;
}

/** In-memory store keyed by IP address */
export const rateLimitStore = new Map<string, RateLimitEntry>();

export function getRateLimitEntry(ip: string): RateLimitEntry | undefined {
  return rateLimitStore.get(ip);
}

export function recordFailedAttempt(ip: string): void {
  const entry = rateLimitStore.get(ip) || { attempts: 0, blockedUntil: null };
  entry.attempts += 1;

  if (entry.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    entry.blockedUntil = Date.now() + RATE_LIMIT_WINDOW_MS;
  }

  rateLimitStore.set(ip, entry);
}

export function resetRateLimit(ip: string): void {
  rateLimitStore.delete(ip);
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const entry = rateLimitStore.get(ip);

  if (!entry) {
    next();
    return;
  }

  if (entry.blockedUntil) {
    const now = Date.now();
    if (now < entry.blockedUntil) {
      const remainingMs = entry.blockedUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      res.status(429).json({
        statusCode: 429,
        error: 'TOO_MANY_ATTEMPTS',
        message: `Muitas tentativas. Tente novamente em ${remainingMinutes} minuto(s).`,
      });
      return;
    }
    // Block expired, reset
    rateLimitStore.delete(ip);
  }

  next();
}
