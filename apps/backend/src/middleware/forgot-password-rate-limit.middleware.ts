import { type Request, type Response, type NextFunction } from 'express';
import { RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_MS } from '@order-system/shared';
import { getClientIp } from '../http/client-ip.js';

/**
 * Mensagem_Neutra: idêntica à resposta de sucesso do fluxo de solicitação de
 * código, para não revelar se o e-mail está cadastrado nem sinalizar que o
 * limite de taxa foi atingido (R4.4 / R9.5).
 */
const NEUTRAL_MESSAGE =
  'Se o e-mail estiver cadastrado, enviamos instruções para redefinir a senha.';

interface Bucket {
  /** Timestamps (ms) das solicitações aceitas dentro da janela corrente. */
  timestamps: number[];
}

/** In-memory store keyed by client IP address. */
export const ipBuckets = new Map<string, Bucket>();
/** In-memory store keyed by normalized (lowercased) e-mail. */
export const emailBuckets = new Map<string, Bucket>();

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Conta as solicitações de uma chave que ainda estão dentro da
 * `Janela_Solicitacao`, descartando timestamps expirados (reset natural — R4.3).
 * Retorna a lista já filtrada para reuso na gravação.
 */
function activeTimestamps(store: Map<string, Bucket>, key: string, now: number): number[] {
  const bucket = store.get(key);
  if (!bucket) {
    return [];
  }
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const active = bucket.timestamps.filter((ts) => ts > cutoff);
  if (active.length === 0) {
    store.delete(key);
  } else {
    bucket.timestamps = active;
  }
  return active;
}

function record(store: Map<string, Bucket>, key: string, active: number[], now: number): void {
  store.set(key, { timestamps: [...active, now] });
}

/**
 * Rate limit dedicado ao fluxo "Esqueceu sua senha?".
 *
 * Aplica dois buckets independentes — por IP e por e-mail normalizado — dentro
 * de uma janela de 15 minutos, com limite de 5 solicitações por dimensão
 * (R4.1/R4.2). Ao atingir o limite em qualquer dimensão, a solicitação é
 * recusada com a `Mensagem_Neutra` e status 200, e o motivo (`rate_limited`) é
 * registrado apenas em log interno. Uma solicitação recusada NÃO grava um novo
 * timestamp nem altera qualquer estado (R4.5).
 */
export function forgotPasswordRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  const ip = getClientIp(req);
  const email = normalizeEmail((req.body as { email?: unknown } | undefined)?.email);

  const ipActive = activeTimestamps(ipBuckets, ip, now);
  const emailActive = email !== null ? activeTimestamps(emailBuckets, email, now) : [];

  const ipBlocked = ipActive.length >= RATE_LIMIT_MAX_ATTEMPTS;
  const emailBlocked = email !== null && emailActive.length >= RATE_LIMIT_MAX_ATTEMPTS;

  if (ipBlocked || emailBlocked) {
    // Recusa: não grava timestamp nem altera códigos; apenas registra o motivo
    // internamente e devolve a resposta neutra indistinguível.
    console.warn(
      `[forgot-password-rate-limit] rate_limited ip=${ipBlocked} email=${emailBlocked}`,
    );
    res.status(200).json({ message: NEUTRAL_MESSAGE });
    return;
  }

  // Dentro do limite: registra a solicitação aceita em ambas as dimensões.
  record(ipBuckets, ip, ipActive, now);
  if (email !== null) {
    record(emailBuckets, email, emailActive, now);
  }

  next();
}
