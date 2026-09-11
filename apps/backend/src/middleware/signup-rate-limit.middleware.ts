import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { getClientIp } from '../http/client-ip.js';
import { sendError } from '../http/send-error.js';

/**
 * Rate limit dedicado ao endpoint público de cadastro (`POST /api/signup`).
 *
 * O signup é platform-level e cria recursos custosos (tenant + Supabase +
 * Evolution), então limitamos abuso por IP de origem sem atrapalhar o reenvio
 * idempotente legítimo (R9.4). Ao exceder o limite na janela vigente, a
 * requisição é recusada com status 429 e mensagem em pt-BR, antes de qualquer
 * efeito colateral (R9.5).
 *
 * Segue o padrão de `public.routes.ts` (`express-rate-limit`), mas com uma
 * janela/limite próprios e resposta no Error_Envelope padrão do projeto
 * (`{ statusCode, error, message }`).
 */

/** Janela de contagem do rate limit de signup: 15 minutos. */
export const SIGNUP_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Máximo de requisições de cadastro por IP dentro da janela. */
export const SIGNUP_RATE_LIMIT_MAX = 5;

/** Código público estável retornado quando o limite é excedido (R9.5). */
const SIGNUP_RATE_LIMIT_ERROR = 'TOO_MANY_REQUESTS';

/** Mensagem em pt-BR devolvida ao exceder o limite (R9.5). */
const SIGNUP_RATE_LIMIT_MESSAGE =
  'Muitas tentativas de cadastro. Tente novamente em alguns minutos.';

/**
 * Middleware `express-rate-limit` por IP de origem para o endpoint de signup.
 *
 * Usa `getClientIp` (mesma resolução de IP dos demais controles de segurança)
 * como chave e responde 429 com o Error_Envelope padrão ao exceder o limite.
 */
export const signupRateLimiter = rateLimit({
  windowMs: SIGNUP_RATE_LIMIT_WINDOW_MS,
  max: SIGNUP_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => getClientIp(req),
  handler: (_req: Request, res: Response) => {
    sendError(res, 429, SIGNUP_RATE_LIMIT_ERROR, SIGNUP_RATE_LIMIT_MESSAGE);
  },
});
